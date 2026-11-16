# University Parking System

Node.js backend + **MySQL database (XAMPP)** — register/login/logout, sessions — **Admin Dashboard** aur **Student/User Dashboard** dono is backend se fully integrated hain, real MySQL database ke sath.

## XAMPP par chalane ka tareeqa

### 1) XAMPP mein MySQL start karein
- **XAMPP Control Panel** kholein.
- **Apache** aur **MySQL** dono ke saamne **"Start"** button dabayein (Apache zaroori nahi is Node backend ke liye, lekin agar aap phpMyAdmin use karna chahen to on rakhein).

### 2) Dependencies install karein
```bash
cd university-parking
npm install
```
(Ye sirf ek chhoti si library `mysql2` install karega — baqi sab pehle jaisa built-in Node hai.)

### 3) Database settings check karein
Project mein pehle se ek `.env` file maujood hai jo **fresh XAMPP install** ke default settings ke sath configured hai:

```
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=university_parking
```

Agar aapne XAMPP mein MySQL root password set kar rakha hai, to `.env` file mein `DB_PASSWORD=` ke aage apna password likh dein.

### 4) Server chalayein
```bash
npm start
```
Ya seedha:
```bash
node src/server.js
```

Server khud hi `university_parking` naam ka database aur uski saari tables (`users`, `sessions`, `parking_spots`, `bookings`, `sync_store`) bana leta hai — **kuch bhi manually banane ki zaroorat nahi**. (Agar aap phir bhi phpMyAdmin se manually banana chahte hain, `setup-database.sql` file di gayi hai — Import tab se use kar sakte hain.)

Phir browser mein kholein: **http://localhost:3000**

> Agar terminal mein `❌ MySQL se connect nahi ho saka` dikhe, to XAMPP Control Panel mein MySQL "Start" hai ya nahi zaroor check karein, aur `.env` ki settings dobara dekh lein.

## Kaise use karein

1. `http://localhost:3000` kholein → **Register** karein (naam, username, email, role — Student/Faculty/Staff — aur password). Har registered account **Student/User Dashboard** par jata hai.
2. **Admin Dashboard** ke liye ek fixed admin account har server start par khud seed ho jata hai (database reset ke baad):
   - username: `admin`
   - password: `admin123`
   (Change karne ke liye `.env` mein `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_EMAIL` / `ADMIN_FULL_NAME` set karein.)
3. **Har `npm start` par database poori tarah reset ho jata hai** — saare purane users, bookings aur sync data clear ho kar sirf fresh admin account ke sath dobara ban jata hai. Yani software hamesha fresh state se shuru hota hai.
4. Login/Logout, sessions, aur donon dashboards ka poora data (parking slot map, reservation requests, announcements, parking directory, reported issues) ab **real backend + MySQL database** se aata hai — har user/tab/device ke darmiyan sync hota hai.
5. **Manage Users** (Admin Dashboard) ab sirf real registered accounts dikhata hai (database se) — Suspend/Activate/Delete/Edit seedha `users` table update karte hain, koi hardcoded demo user nahi.
6. Apna data phpMyAdmin (`http://localhost/phpmyadmin`) mein `university_parking` database ke andar bhi dekh sakte hain.

## Folder structure

```
university-parking/
├── src/
│   ├── config/
│   │   ├── database.js         -> MySQL connection pool + schema auto-setup (users, sessions, parking_spots, bookings, sync_store)
│   │   └── mimeTypes.js        -> static file MIME type map
│   ├── controllers/
│   │   ├── auth.controller.js  -> register / login / logout / me business logic
│   │   └── sync.controller.js  -> dashboard shared-state store (slots/requests/announcements/users/issues) + bootstrap
│   ├── routes/
│   │   ├── auth.routes.js      -> maps /api/* auth requests to controllers
│   │   └── sync.routes.js      -> maps /api/sync/* and /api/bootstrap to controllers
│   ├── services/
│   │   └── auth.service.js     -> password hashing (scrypt), sessions, cookies
│   ├── utils/
│   │   ├── http.js             -> sendJSON, readBody helpers
│   │   └── staticFileServer.js -> serves files from /public
│   ├── app.js                  -> builds the HTTP server (routing wiring)
│   └── server.js               -> entry point, connects to MySQL then starts the server
├── public/
│   ├── index.html, login.html, register.html
│   ├── admin-dashboard.html    -> Admin Dashboard (auth-guarded, DB-backed)
│   └── user-dashboard.html     -> Student/User Dashboard (auth-guarded, DB-backed)
├── setup-database.sql          -> optional manual schema import (phpMyAdmin)
├── .env                        -> DB credentials (XAMPP defaults, already filled in)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## API Endpoints

| Method | Route              | Body / Notes                                                                 |
|--------|---------------------|-------------------------------------------------------------------------------|
| POST   | /api/register        | fullName, username, email, password, confirmPassword, userType (student/faculty/staff) |
| POST   | /api/login            | username (ya email), password                                                |
| POST   | /api/logout           | —                                                                              |
| GET    | /api/me                | — (session cookie se logged-in user return karta hai)                        |
| GET    | /api/bootstrap        | — login required; ek hi call mein user + slots/requests/announcements/users/issues |
| GET    | /api/sync/:key         | login required; key ∈ slots, requests, announcements, users, issues          |
| PUT    | /api/sync/:key         | login required; body `{ "value": <JSON> }` — poori collection replace karta hai |

## Dashboards kaise integrated hain

- Dono dashboard files (`admin-dashboard.html`, `user-dashboard.html`) ke `<head>` mein ek **auth-guard script** hai jo page render hone se pehle `/api/bootstrap` call karta hai:
  - Login nahi → `login.html` par redirect.
  - Admin Dashboard par non-admin → `user-dashboard.html` par redirect.
  - Warna `window.__BOOTSTRAP__` mein user + shared data mil jata hai.
- Purana localStorage-based `ParkingSync` bridge ab `/api/sync/:key` par fetch/PUT karta hai — get/set ka wahi interface hai (koi UI code todna nahi para), bas data ab **MySQL database** mein persist hota hai aur har ~4 seconds mein poll ho kar cross-tab/cross-user sync hota hai. (`slots`, `requests`, `announcements`, `issues` isi bridge se aate hain — `users` ab is se hata diya gaya hai, kyunke woh ab seedha `/api/admin/users` se real database se aata hai.)
- Register page par intaqhab kiya hua role (Student/Faculty/Staff) `userType` ke tor par store hota hai aur dono dashboards ki profile cards mein real data (naam, email, role) dikhta hai — ab koi hardcoded demo user nahi.
- Logout button ab `/api/logout` call kar ke session khatam karta hai aur `login.html` par le jata hai.

## Important notes

- **Admin account ek fixed, pre-seeded account hai** (username `admin`, password `admin123` by default — `.env` se change karein) jo har server start par khud ban jata hai. Register se banaya gaya har account `user` role leta hai. Register form ka "role" dropdown (Student/Faculty/Staff) sirf `userType` set karta hai (parking directory ke liye), auth role alag hai.
- **Har server restart (`npm start`) par poora database reset ho jata hai** — is demo/development setup mein data persist nahi hota; production mein `resetSchema()` ka call `src/config/database.js` se hata dein agar aap chahte hain data restarts ke darmiyan bacha rahe.
- Passwords `scrypt` (Node ka built-in crypto) se hash hote hain — plain text kahin store nahi hota.
- Login session ek secure `HttpOnly` cookie (`sp_session`) mein rehta hai, 7 din valid.
- Suspended ya 3-strike blocked accounts login nahi kar sakte (login endpoint check karta hai).
- `parking_spots` aur `bookings` tables already ban chuke hain agar future mein relational booking flow banana ho.
- Database connection ek **connection pool** (`mysql2/promise`) use karta hai, isliye multiple users/tabs ek sath kaam kar sakte hain bina performance issue ke.

## Live Camera (Hikvision / RTSP) Dashboard mein Dikhana — MediaMTX Setup

Admin Dashboard ke "Live Camera" section mein IP cameras (jaise Hikvision) ka
live feed dikhta hai. Lekin **browser (Chrome/Edge/Firefox) `rtsp://` link ko
direct play nahi karta** — isi liye seedha RTSP URL (e.g.
`rtsp://admin:test%40333@192.168.1.64:554/Streaming/Channels/102`) dashboard
mein daalne se sirf text dikhta hai, video nahi.

**Solution: MediaMTX.** Ye ek chhota server hai jo camera se RTSP leta hai aur
usay browser ke liye WebRTC (WHEP) mein convert kar deta hai — jo browser
directly play kar sakta hai. `admin-dashboard.html` ka "IP Camera" mode is
WHEP URL ko expect karta hai, raw RTSP link ko nahi.

### Is repo mein shamil files (`mediamtx/` folder)
| File | Kaam |
|---|---|
| `mediamtx.yml` | MediaMTX ki config — camera ka RTSP address is mein set hai |
| `start-mediamtx.bat` | Double-click karke MediaMTX chalane ke liye (cmd khud khulega) |
| `start-mediamtx-silent.vbs` | Windows startup pe **bina cmd window dikhaye** background mein chalane ke liye |

(`mediamtx.exe` khud download karna hoga — repo mein shamil nahi, neeche dekhein.)

### Part 1 — Pehli dafa Setup
1. **MediaMTX download karein:** https://github.com/bluenviron/mediamtx/releases
   se sirf `mediamtx_vX.X.X_windows_amd64.zip` (❌ "Source code" wali file nahi).
2. Naya folder banayein: `C:\mediamtx\`
3. Zip ko **right-click → Extract All** karke `C:\mediamtx\` mein extract karein
   (agar subfolder ban jaye, `mediamtx.exe` uske andar dhoondein).
4. Is repo ke `mediamtx/` folder ki teeno files (`mediamtx.yml`,
   `start-mediamtx.bat`, `start-mediamtx-silent.vbs`) copy karke usi
   `C:\mediamtx\` folder mein paste kar dein (jahan `mediamtx.exe` hai).

### Part 2 — Camera settings (`mediamtx.yml`)
```yaml
webrtc: true
webrtcAddress: :8889
webrtcEncryption: false

paths:
  cam1:
    source: rtsp://admin:test%40333@192.168.1.64:554/Streaming/Channels/102
```
- `cam2`/`cam3`/`cam4` sirf placeholder examples hain — agar wo cameras
  nahi hain to unka poora block file se delete kar dein.
- IP/password badlay to `source:` line update karein. Password mein `@` ho
  to usay `%40` likhein (e.g. asal password `test@333` → `test%40333`).
- **Zaroori:** yaml mein boolean values (`true`/`false`) kabhi quotes ke
  sath na likhein (`"false"` galat hai, `false` sahi hai) — warna
  `cannot unmarshal string into Go value of type bool` error aata hai.

### Part 3 — Chalayein
**Manual:** `start-mediamtx.bat` par double-click karein (cmd window khulegi,
band na karein). Terminal mein ye line dikhni chahiye:
```
INF [path cam1] stream is available and online, 2 tracks (H264, G711)
```

**Automatic (PC on hotay hi khud chale, bina koi window dikhaye):**
1. `Windows key + R` → `shell:startup` → Enter (Startup folder khulega)
2. `start-mediamtx-silent.vbs` par right-click → **Send to** → **Desktop (create shortcut)**
3. Desktop wala shortcut cut/copy karke Startup folder mein paste kar dein
4. PC restart karein — Task Manager (Ctrl+Shift+Esc → Details) mein
   `mediamtx.exe` chalta hua dikhega, koi window nazar nahi aayegi

### Part 4 — Dashboard mein URL daalein
Admin Dashboard → Live Camera → **CAM 01 — Entrance** ke "IP Camera" box mein:
```
http://localhost:8889/cam1/whep
```
(agar dashboard kisi doosri device se khol rahe hain, `localhost` ki jagah
is Windows PC ka IP address daalein — `ipconfig` se maloom karein — e.g.
`http://192.168.1.50:8889/cam1/whep`.) **Connect** dabayein — video live aa jani chahiye.

### Camera Troubleshooting
| Error / Masla | Wajah | Hal |
|---|---|---|
| `cannot unmarshal string into Go value of type bool` | config mein `"true"`/`"false"` quotes ke sath likha | `mediamtx.yml` mein bina quotes ke `true`/`false` likhein |
| `i/o timeout` (RTSP source) | MediaMTX camera tak network par nahi pohanch pa raha | `ping <camera-ip>` chalayein; fail ho to cable/IP check karein, Hikvision ka **SADP Tool** se camera ka asal IP confirm karein |
| `401 unauthorized` | RTSP username/password galat | Camera settings mein RTSP credentials dubara check karein |
| Dashboard mein video phir bhi na aaye | MediaMTX chal hi nahi raha, ya galat WHEP URL | Cmd/terminal mein "stream is available and online" line confirm karein; dashboard URL `http://localhost:8889/cam1/whep` sahi likha hona chahiye |
| Dashboard mein `rtsp://` link daalne par error | Browser RTSP nahi chala sakta | Raw RTSP ki jagah hamesha MediaMTX ka WHEP URL (`http://.../camX/whep`) use karein |

## Vehicle Detection se Slots Automatically Update Karna (AI)

Ab camera ke feed se vehicles detect ho kar parking slots ka status
(`available`/`occupied`) **khud** database mein update ho sakta hai — manual
mark karne ki zaroorat nahi. Poora setup aur explanation
`vehicle-detection/README.md` mein hai. Short version:

1. `vehicle-detection/` folder mein jayein, `pip install -r requirements.txt`
2. `python calibrate_slots.py` — camera ke frame par slots mark karein
3. `python vehicle_detection.py` (ya `start-detection.bat` double-click) —
   MediaMTX aur Node server dono pehle se chal rahay hon
4. Jaise hi vehicle kisi slot mein aaye/jaye, dashboard khud update ho jayega

## Troubleshooting (Backend / Database)



| Masla | Hal |
|---|---|
| `ECONNREFUSED 127.0.0.1:3306` | XAMPP Control Panel mein MySQL "Start" nahi hai — start karein. |
| `Access denied for user 'root'` | `.env` mein `DB_PASSWORD` ghalat hai — apna XAMPP MySQL root password check karein. |
| `Unknown database` | Khud ban jani chahiye; agar nahi bani to `setup-database.sql` phpMyAdmin se manually import karein. |
| Port 3000 already in use | `.env` mein `PORT=` ki value badal dein (e.g. `3001`). |
