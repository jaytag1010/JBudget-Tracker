# SpendWise — Setup Guide

## 1. Create a Firebase Project

1. Go to https://console.firebase.google.com
2. Click **Add project** → name it (e.g. `spendwise`)
3. Disable Google Analytics (optional) → **Create project**

## 2. Enable Firestore

1. In your project → **Build → Firestore Database**
2. Click **Create database**
3. Choose **Start in test mode** (allows all reads/writes during development)
4. Select a region → **Enable**

## 3. Get Your Firebase Config

1. In your project → **Project Settings** (gear icon)
2. Scroll to **Your apps** → click **</>** (Web)
3. Register app name → **Register app**
4. Copy the `firebaseConfig` object

## 4. Paste Config into the App

Open `firebase/config.js` and replace the placeholder values:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "your-project.firebaseapp.com",
  projectId:         "your-project",
  storageBucket:     "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123:web:abc123"
};
```

## 5. Run Locally

Option A — VS Code Live Server:
- Install the **Live Server** extension
- Right-click `index.html` → **Open with Live Server**

Option B — Any static server:
```bash
npx serve .
# or
python -m http.server 8080
```

> ⚠️ The app uses ES Modules — it won't work via `file://` directly.
> You must serve it over HTTP/HTTPS.

## 6. Deploy to Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Public directory: .  (the current folder)
# Single-page app: No
# Overwrite index.html: No
firebase deploy
```

Your app will be live at `https://your-project.web.app`

---

## Firestore Collections

| Collection       | Purpose                           |
|------------------|-----------------------------------|
| `expenses`       | All transactions                  |
| `categories`     | Spending categories               |
| `paymentMethods` | Payment methods                   |
| `budgets`        | Monthly budgets (doc ID = YYYY-MM)|
| `savingsGoals`   | Savings goals                     |

---

## Firestore Security Rules (Production)

Replace test mode rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow only authenticated users (add Firebase Auth first)
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## Future Upgrades

- **Firebase Auth** — add login so each user has private data
- **Multi-currency** — store currency preference in settings doc
- **Recurring expenses** — add `recurring` flag + cron-style auto-add
- **Export to CSV** — client-side CSV generation from expense list
- **PWA / install prompt** — add `manifest.json` + service worker for offline use
- **Charts** — add Chart.js for monthly spending breakdown
- **Notifications** — Firebase Cloud Messaging for budget alerts
