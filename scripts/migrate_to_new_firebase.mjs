import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

const oldApp = initializeApp({
  apiKey: 'AIzaSyCq8vWu2cE5VQqjwFYgoY6LIW7XDJ0WnAo',
  authDomain: 'airskid.firebaseapp.com',
  projectId: 'airskid'
}, 'oldApp');

const newApp = initializeApp({
  apiKey: 'AIzaSyAIyWWSiSOyVreivrFBWzxNxjjDNraynMo',
  authDomain: 'airskido-dc592.firebaseapp.com',
  projectId: 'airskido-dc592'
}, 'newApp');

const oldDb = getFirestore(oldApp);
const newDb = getFirestore(newApp);

async function migrate() {
  console.log('🚀 Starting migration from airskid -> airskido-dc592...');

  // 1. Migrate leaderboard_snapshots
  for (const trackDoc of ['classic_top100', 'hardcore_top100']) {
    try {
      const snap = await getDoc(doc(oldDb, 'leaderboard_snapshots', trackDoc));
      if (snap.exists()) {
        await setDoc(doc(newDb, 'leaderboard_snapshots', trackDoc), snap.data());
        console.log(`✅ Migrated leaderboard_snapshots/${trackDoc}`);
      }
    } catch (e) {
      console.error(`❌ Failed leaderboard_snapshots/${trackDoc}:`, e.message);
    }
  }

  // 2. Migrate users collection
  try {
    const usersSnap = await getDocs(collection(oldDb, 'users'));
    for (const d of usersSnap.docs) {
      await setDoc(doc(newDb, 'users', d.id), d.data());
      console.log(`✅ Migrated users/${d.id} (${d.data().username})`);
    }
  } catch (e) {
    console.error('❌ Failed migrating users collection:', e.message);
  }

  // 3. Migrate users_pbs collection
  try {
    const pbsSnap = await getDocs(collection(oldDb, 'users_pbs'));
    for (const d of pbsSnap.docs) {
      await setDoc(doc(newDb, 'users_pbs', d.id), d.data());
      console.log(`✅ Migrated users_pbs/${d.id}`);
    }
  } catch (e) {
    console.error('❌ Failed migrating users_pbs collection:', e.message);
  }

  // 4. Migrate leaderboards_time_sprint
  try {
    const sprintSnap = await getDocs(collection(oldDb, 'leaderboards_time_sprint'));
    for (const d of sprintSnap.docs) {
      await setDoc(doc(newDb, 'leaderboards_time_sprint', d.id), d.data());
      console.log(`✅ Migrated leaderboards_time_sprint/${d.id}`);
    }
  } catch (e) {
    console.error('❌ Failed migrating leaderboards_time_sprint collection:', e.message);
  }

  // 5. Migrate usernames collection if any
  try {
    const usernamesSnap = await getDocs(collection(oldDb, 'usernames'));
    for (const d of usernamesSnap.docs) {
      await setDoc(doc(newDb, 'usernames', d.id), d.data());
      console.log(`✅ Migrated usernames/${d.id}`);
    }
  } catch (e) {
    console.error('❌ Failed migrating usernames collection:', e.message);
  }

  console.log('🎉 Migration finished!');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('💥 Migration fatal error:', err);
  process.exit(1);
});
