# Ninjalinking MCP Orders Server

Serveur MCP (Model Context Protocol) pour gérer les commandes Ninjalinking via l'API Laravel.

## Installation

```bash
npm install
```

## Configuration

1. Copiez le fichier `.env.example` vers `.env` :
```bash
cp .env.example .env
```

2. Configurez les variables d'environnement dans `.env` :
```env
GOUDO_API_URL=https://your-laravel-api.com
GOUDO_API_TOKEN=your-bearer-token-here
```

## Build

```bash
npm run build
```

## Utilisation

### Démarrer le serveur
```bash
npm start
```

### Mode développement (avec recompilation)
```bash
npm run dev
```

### Watch mode
```bash
npm run watch
```

## Resources exposées

### 1. `orders://pending`
Liste toutes les commandes payées en attente de traitement.

**Endpoint:** `GET /api/mcp/orders?status=paid`

### 2. `orders://{id}/details`
Récupère les détails d'une commande spécifique.

**Endpoint:** `GET /api/mcp/orders/{id}`

**Exemple:** `orders://123/details`

### 3. `orders://links/pending`
Liste tous les liens en attente de finalisation.

**Endpoint:** `GET /api/mcp/links/pending`

## Tools exposés

### 1. `complete_link`
Marque un lien comme complété avec les détails du forum.

**Paramètres:**
- `link_id` (number, requis): ID du lien à compléter
- `forum_url` (string, requis): URL du post de forum où le lien a été publié
- `anchor_used` (string, requis): Texte d'ancre utilisé pour le lien
- `forum_domain` (string, optionnel): Domaine du forum
- `notes` (string, optionnel): Notes additionnelles

**Endpoint:** `POST /api/mcp/links/{link_id}/complete`

**Exemple:**
```json
{
  "link_id": 456,
  "forum_url": "https://forum.example.com/thread/123",
  "anchor_used": "meilleur casino en ligne",
  "forum_domain": "forum.example.com",
  "notes": "Lien publié avec succès"
}
```

### 2. `update_link_step`
Met à jour l'étape de travail d'un lien.

**Paramètres:**
- `link_id` (number, requis): ID du lien à mettre à jour
- `work_step` (string, requis): Nouvelle étape de travail

**Endpoint:** `POST /api/mcp/links/{link_id}/work-step`

**Exemple:**
```json
{
  "link_id": 456,
  "work_step": "in_progress"
}
```

## Authentification

Tous les appels API incluent automatiquement le header :
```
Authorization: Bearer {GOUDO_API_TOKEN}
```

## Logs

Les logs sont écrits sur `stderr` pour faciliter le débogage :
- `[MCP]` : Événements du serveur MCP
- `[API]` : Requêtes HTTP vers l'API Laravel
- `[ERROR]` : Erreurs critiques

## Structure du projet

```
ninjalinking-mcp-orders/
├── src/
│   ├── index.ts        # Serveur MCP principal
│   ├── api-client.ts   # Client API Laravel
│   └── types.ts        # Définitions TypeScript
├── dist/               # Fichiers compilés (généré)
├── .env.example        # Exemple de configuration
├── .env                # Configuration locale (à créer)
├── package.json
├── tsconfig.json
└── README.md
```

## Configuration Claude Desktop

Pour utiliser ce serveur avec Claude Desktop, ajoutez-le à votre configuration MCP :

```json
{
  "mcpServers": {
    "ninjalinking-orders": {
      "command": "node",
      "args": ["/path/to/ninjalinking-mcp-orders/dist/index.js"],
      "env": {
        "GOUDO_API_URL": "https://your-laravel-api.com",
        "GOUDO_API_TOKEN": "your-bearer-token-here"
      }
    }
  }
}
```

Ou utilisez le fichier `.env` et lancez avec :

```json
{
  "mcpServers": {
    "ninjalinking-orders": {
      "command": "node",
      "args": ["/path/to/ninjalinking-mcp-orders/dist/index.js"],
      "cwd": "/path/to/ninjalinking-mcp-orders"
    }
  }
}
```

## Gestion des erreurs

Le serveur gère les erreurs de manière robuste :
- Validation des paramètres obligatoires
- Gestion des erreurs HTTP (4xx, 5xx)
- Gestion des erreurs réseau
- Logs détaillés pour le débogage

Toutes les erreurs sont retournées avec des messages clairs pour faciliter le diagnostic.
