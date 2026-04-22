const admin = require("firebase-admin");

let initialized = false;

function buildCredential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n")
    });
  }

  return null;
}

function initializeFirebase() {
  if (initialized) {
    return admin;
  }

  const credential = buildCredential();

  if (!credential) {
    return null;
  }

  admin.initializeApp({ credential });
  initialized = true;
  return admin;
}

function getFirebaseAdmin() {
  return initializeFirebase();
}

module.exports = {
  getFirebaseAdmin
};
