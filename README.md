# 🤖 Discord Ticket Bot — PDS/FDS

Bot Discord complet avec système de tickets et gestion de service.

---

## ✅ Fonctionnalités

### 🎫 Système de Tickets
- `/setup` — Configure le bot (admin uniquement)
- Panel avec boutons par rôle (ex: Marshal, Général…)
- Formulaire : Pseudo Roblox, Grade, Preuve (optionnel)
- Ping automatique du rôle concerné à l'ouverture
- Bouton **Réclamer** (staff uniquement)
- Bouton **Fermer** (staff uniquement) → suppression automatique

### 🟢 Prise / Fin de service
- `/pds` — Déclare ta prise de service (avec rôle et heure)
- `/fds` — Termine ton service (affiche la durée)
- `/rapport` — Affiche tous les PDS/FDS + agents actuellement en service

---

## 🚀 Installation & Déploiement

### Étape 1 — Créer le Bot Discord

1. Va sur https://discord.com/developers/applications
2. Clique **New Application** → donne un nom
3. Va dans **Bot** → clique **Add Bot**
4. Active ces **Privileged Gateway Intents** :
   - ✅ Server Members Intent
   - ✅ Message Content Intent
5. Copie le **Token** (garde-le secret !)
6. Va dans **OAuth2 > General** → copie l'**Application ID** (= CLIENT_ID)
7. Va dans **OAuth2 > URL Generator** :
   - Coche `bot` + `applications.commands`
   - Permissions : `Administrator` (ou au minimum : Manage Channels, Send Messages, Embed Links, Manage Roles)
   - Copie le lien et invite le bot sur ton serveur

---

### Étape 2 — Mettre sur GitHub

1. Crée un compte GitHub sur https://github.com
2. Crée un **nouveau repository** (ex: `discord-bot`)
3. Upload tous les fichiers du bot (sauf `.env` et `node_modules`)
4. Ou via Git :
```bash
git init
git add .
git commit -m "Initial bot"
git remote add origin https://github.com/TON_PSEUDO/discord-bot.git
git push -u origin main
```

---

### Étape 3 — Déployer sur Render (h24 gratuit)

1. Va sur https://render.com → crée un compte
2. Clique **New +** → **Web Service** (ou **Background Worker**)
3. Connecte ton repo GitHub
4. Configure :
   - **Name** : `discord-ticket-bot`
   - **Runtime** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Plan** : Free (suffisant pour un bot)
5. Dans **Environment Variables**, ajoute :
   ```
   TOKEN = TON_TOKEN_BOT
   CLIENT_ID = TON_CLIENT_ID
   ```
6. Clique **Create Web Service** → le bot se lance !

> ⚠️ Sur le plan gratuit Render, le service peut s'endormir après 15 min d'inactivité.
> Pour le garder éveillé h24, utilise https://uptimerobot.com (gratuit) :
> - Crée un monitor HTTP
> - URL : l'URL de ton service Render (ex: https://mon-bot.onrender.com)
> - Intervalle : 5 minutes

---

## ⚙️ Configuration du Bot

Une fois le bot en ligne sur ton serveur :

### 1. `/setup` (admin uniquement)
Lance `/setup` et remplis le formulaire :
- **Catégorie** : Nom de la catégorie où seront créés les tickets (ex: `📋 Tickets`)
- **ID Rôle Staff** : L'ID du rôle qui peut claim/fermer les tickets
- **IDs des rôles** : Les IDs des rôles à afficher comme boutons (séparés par des virgules)
  - Ex: `123456789012345678, 987654321098765432`
- **ID Salon** : L'ID du salon où envoyer le panneau de tickets

### Comment trouver un ID Discord ?
1. Active le **Mode Développeur** : Paramètres > Avancés > Mode Développeur
2. Clic droit sur un rôle/salon → **Copier l'identifiant**

---

## 📋 Commandes

| Commande | Description | Permission |
|----------|-------------|------------|
| `/setup` | Configure le système de tickets | Administrateur |
| `/pds` | Prise de service | Tout le monde |
| `/fds` | Fin de service | Tout le monde |
| `/rapport [page]` | Historique des services | Tout le monde |

---

## 📁 Structure des fichiers

```
discord-bot/
├── index.js          # Code principal du bot
├── package.json      # Dépendances Node.js
├── render.yaml       # Config Render (optionnel)
├── .env.example      # Exemple de variables d'environnement
├── .gitignore        # Fichiers à ignorer (dont .env)
└── README.md         # Ce fichier
```

---

## 🔒 Sécurité

- Ne partage **jamais** ton token Discord
- Le fichier `.env` est dans `.gitignore` → il ne sera pas uploadé sur GitHub
- Sur Render, les variables d'environnement sont chiffrées
