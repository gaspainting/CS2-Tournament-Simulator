export type PersistenceGuard = {
  markLoadFailure: () => void;
  markRecovery: () => void;
  shouldPersist: (loading: boolean) => boolean;
};

export function createPersistenceGuard(): PersistenceGuard {
  let persistenceBlocked = false;
  return {
    markLoadFailure() {
      persistenceBlocked = true;
    },
    markRecovery() {
      persistenceBlocked = false;
    },
    shouldPersist(loading) {
      return !loading && !persistenceBlocked;
    },
  };
}
