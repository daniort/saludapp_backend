function queryResult(rows = []) {
  return { rows, rowCount: rows.length };
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

class MemoryClient {
  constructor(database) {
    this.database = database;
    this.transactionState = null;
    this.releaseTransaction = null;
  }

  async query(sql, params = []) {
    const normalized = normalizeSql(sql);

    if (normalized === 'BEGIN') {
      this.releaseTransaction = await this.database.acquireTransaction();
      this.transactionState = structuredClone(this.database.state);
      return queryResult();
    }

    if (normalized === 'COMMIT') {
      this.database.state = this.transactionState;
      this.transactionState = null;
      this.releaseTransaction();
      this.releaseTransaction = null;
      return queryResult();
    }

    if (normalized === 'ROLLBACK') {
      this.transactionState = null;
      this.releaseTransaction?.();
      this.releaseTransaction = null;
      return queryResult();
    }

    return this.database.execute(normalized, params, this.transactionState);
  }

  release() {
    this.releaseTransaction?.();
    this.releaseTransaction = null;
  }
}

class RegistrationMemoryDatabase {
  constructor() {
    this.state = { users: [], profiles: [], userProfiles: [] };
    this.nextId = 1;
    this.transactionTail = Promise.resolve();
    this.failNextProfileInsert = false;
  }

  id(prefix) {
    const id = `${prefix}-${this.nextId}`;
    this.nextId += 1;
    return id;
  }

  now() {
    return new Date('2026-11-18T12:00:00.000Z');
  }

  async acquireTransaction() {
    const previous = this.transactionTail;
    let release;
    this.transactionTail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  }

  async connect() {
    return new MemoryClient(this);
  }

  async query(sql, params = []) {
    return this.execute(normalizeSql(sql), params, this.state);
  }

  seedUser({ uid, email, displayName = null }) {
    const user = {
      id: this.id('user'),
      firebase_uid: uid,
      email,
      display_name: displayName,
      email_verified: true,
      is_active: true,
      deleted_at: null,
    };
    this.state.users.push(user);
    return user;
  }

  seedPersonalProfile(userId, { withOwnerRelation = false } = {}) {
    const profile = {
      id: this.id('profile'),
      profile_type: 'personal',
      given_names: 'Usuario existente',
      paternal_surname: null,
      maternal_surname: null,
      birth_date: null,
      created_by_user_id: userId,
      created_at: this.now(),
      updated_at: this.now(),
      deleted_at: null,
    };
    this.state.profiles.push(profile);

    if (withOwnerRelation) {
      this.state.userProfiles.push({
        id: this.id('relation'),
        user_id: userId,
        profile_id: profile.id,
        is_owner: true,
        access_role: 'owner',
        created_at: this.now(),
        updated_at: this.now(),
        deleted_at: null,
      });
    }

    return profile;
  }

  counts() {
    return {
      users: this.state.users.length,
      profiles: this.state.profiles.length,
      userProfiles: this.state.userProfiles.length,
    };
  }

  execute(sql, params, state) {
    if (
      sql.startsWith('SELECT id, firebase_uid, email, display_name FROM users')
      && sql.includes('WHERE firebase_uid = $1')
    ) {
      const user = state.users.find((item) => item.firebase_uid === params[0]);
      return queryResult(user ? [{ ...user }] : []);
    }

    if (sql.startsWith('UPDATE users SET')) {
      const user = state.users.find((item) => item.id === params[0]);
      if (!user) return queryResult();
      user.email = params[1];
      user.display_name = params[2] ?? user.display_name;
      user.email_verified = params[3];
      user.is_active = true;
      user.deleted_at = null;
      return queryResult([{ ...user }]);
    }

    if (sql.startsWith('INSERT INTO users')) {
      const [uid, email, displayName, emailVerified] = params;
      const sameUid = state.users.find((item) => item.firebase_uid === uid);
      if (sameUid) return queryResult();

      const sameEmail = state.users.find(
        (item) => item.deleted_at === null
          && item.email.toLowerCase() === email.toLowerCase(),
      );
      if (sameEmail) {
        const error = new Error('unique email');
        error.code = '23505';
        throw error;
      }

      const user = {
        id: this.id('user'),
        firebase_uid: uid,
        email,
        display_name: displayName,
        email_verified: emailVerified,
        is_active: true,
        deleted_at: null,
      };
      state.users.push(user);
      return queryResult([{ ...user }]);
    }

    if (sql.includes('FROM profiles p LEFT JOIN user_profiles up')) {
      const userId = params[0];
      const rows = state.profiles
        .filter(
          (profile) => profile.created_by_user_id === userId
            && profile.profile_type === 'personal'
            && profile.deleted_at === null,
        )
        .sort((left, right) => left.created_at - right.created_at)
        .map((profile) => {
          const relation = state.userProfiles.find(
            (item) => item.user_id === userId
              && item.profile_id === profile.id
              && item.deleted_at === null,
          );
          return { ...profile, relation_id: relation?.id ?? null };
        });
      return queryResult(rows);
    }

    if (sql.startsWith('INSERT INTO profiles')) {
      if (this.failNextProfileInsert) {
        this.failNextProfileInsert = false;
        throw new Error('PROFILE_INSERT_FAILED');
      }

      const [givenNames, paternalSurname, maternalSurname, birthDate, userId] = params;
      const duplicate = state.profiles.find(
        (profile) => profile.created_by_user_id === userId
          && profile.profile_type === 'personal'
          && profile.deleted_at === null,
      );
      if (duplicate) {
        const error = new Error('duplicate personal profile');
        error.code = '23505';
        throw error;
      }

      const profile = {
        id: this.id('profile'),
        profile_type: 'personal',
        given_names: givenNames,
        paternal_surname: paternalSurname,
        maternal_surname: maternalSurname,
        birth_date: birthDate,
        created_by_user_id: userId,
        created_at: this.now(),
        updated_at: this.now(),
        deleted_at: null,
      };
      state.profiles.push(profile);
      return queryResult([{ ...profile }]);
    }

    if (sql.startsWith('INSERT INTO user_profiles')) {
      const [userId, profileId] = params;
      let relation = state.userProfiles.find(
        (item) => item.user_id === userId
          && item.profile_id === profileId
          && item.deleted_at === null,
      );

      if (relation) {
        relation.is_owner = true;
        relation.access_role = 'owner';
        relation.updated_at = this.now();
      } else {
        const otherOwner = state.userProfiles.find(
          (item) => item.profile_id === profileId
            && item.is_owner
            && item.deleted_at === null,
        );
        if (otherOwner) {
          const error = new Error('duplicate owner');
          error.code = '23505';
          throw error;
        }

        relation = {
          id: this.id('relation'),
          user_id: userId,
          profile_id: profileId,
          is_owner: true,
          access_role: 'owner',
          created_at: this.now(),
          updated_at: this.now(),
          deleted_at: null,
        };
        state.userProfiles.push(relation);
      }

      return queryResult();
    }

    if (sql.includes('FROM user_profiles up INNER JOIN profiles p')) {
      const userId = params[0];
      const rows = state.userProfiles
        .filter((relation) => relation.user_id === userId && relation.deleted_at === null)
        .map((relation) => {
          const profile = state.profiles.find(
            (item) => item.id === relation.profile_id && item.deleted_at === null,
          );
          return profile ? { ...profile, access_role: relation.access_role } : null;
        })
        .filter(Boolean)
        .sort((left, right) => left.created_at - right.created_at);
      return queryResult(rows);
    }

    throw new Error(`Unhandled test query: ${sql}`);
  }
}

module.exports = { RegistrationMemoryDatabase };
