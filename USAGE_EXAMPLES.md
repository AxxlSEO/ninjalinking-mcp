# Exemples d'utilisation

## Configuration de Claude Desktop

### Option 1 : Utiliser le fichier .env (recommandé)

Ajoutez à votre `~/Library/Application Support/Claude/claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "ninjalinking-orders": {
      "command": "node",
      "args": [
        "/Users/axel/ninjalinking-mcp-orders/dist/index.js"
      ],
      "cwd": "/Users/axel/ninjalinking-mcp-orders"
    }
  }
}
```

### Option 2 : Variables d'environnement directes

```json
{
  "mcpServers": {
    "ninjalinking-orders": {
      "command": "node",
      "args": [
        "/Users/axel/ninjalinking-mcp-orders/dist/index.js"
      ],
      "env": {
        "GOUDO_API_URL": "https://your-api.com",
        "GOUDO_API_TOKEN": "your-token"
      }
    }
  }
}
```

## Test de connexion

Avant de configurer Claude Desktop, testez la connexion à l'API :

```bash
# Configurez votre .env
cp .env.example .env
# Éditez .env avec vos vraies valeurs

# Lancez le test
npm run test
```

Vous devriez voir :
```
🧪 Testing Ninjalinking API Connection...
📍 API URL: https://your-api.com
🔑 Token: sk_test_ab...
📦 Test 1: Fetching pending orders...
✅ Success! Found 5 orders
...
```

## Exemples de prompts Claude

Une fois le serveur MCP configuré dans Claude Desktop, vous pouvez utiliser ces prompts :

### Lister les commandes en attente
```
Peux-tu me montrer toutes les commandes payées en attente ?
```

Claude utilisera automatiquement la resource `orders://pending`.

### Voir les détails d'une commande
```
Montre-moi les détails de la commande #123
```

Claude utilisera `orders://123/details`.

### Lister les liens en attente
```
Quels sont les liens qui attendent d'être complétés ?
```

Claude utilisera `orders://links/pending`.

### Compléter un lien
```
Marque le lien #456 comme complété avec :
- URL du forum : https://forum.example.com/thread/123
- Ancre utilisée : meilleur casino en ligne
- Domaine : forum.example.com
- Note : Publié avec succès dans la section casino
```

Claude utilisera le tool `complete_link` :
```json
{
  "link_id": 456,
  "forum_url": "https://forum.example.com/thread/123",
  "anchor_used": "meilleur casino en ligne",
  "forum_domain": "forum.example.com",
  "notes": "Publié avec succès dans la section casino"
}
```

### Mettre à jour l'étape de travail
```
Mets à jour le lien #456 à l'étape "in_progress"
```

Claude utilisera le tool `update_link_step` :
```json
{
  "link_id": 456,
  "work_step": "in_progress"
}
```

## Workflow typique

1. **Lister les liens en attente**
   ```
   Montre-moi tous les liens en attente de traitement
   ```

2. **Mettre à jour le statut au début du travail**
   ```
   Marque le lien #456 comme "in_progress"
   ```

3. **Publier le lien sur le forum**
   (Travail manuel sur le forum)

4. **Marquer le lien comme complété**
   ```
   Marque le lien #456 comme complété avec l'URL https://forum.example.com/thread/789
   et l'ancre "meilleur site"
   ```

5. **Vérifier les commandes**
   ```
   Montre-moi les détails de la commande #123 pour voir si tous les liens sont complétés
   ```

## Débogage

### Voir les logs du serveur MCP

Les logs sont envoyés sur `stderr`. Dans Claude Desktop, vous pouvez les voir en :
1. Ouvrant la console développeur (Cmd+Option+I sur Mac)
2. Regardant les logs dans l'onglet Console

Vous verrez des messages comme :
```
[MCP] Starting Ninjalinking Orders MCP Server...
[MCP] API URL: https://your-api.com
[MCP] Server ready
[MCP] Listing resources
[API] GET https://your-api.com/api/mcp/orders?status=paid
[API] Success: {"data":[{"id":1,...
```

### Erreurs communes

**Erreur 401 Unauthorized**
- Vérifiez que votre `GOUDO_API_TOKEN` est correct
- Vérifiez que le token n'a pas expiré

**Erreur 404 Not Found**
- Vérifiez que votre `GOUDO_API_URL` est correct
- Vérifiez que les endpoints existent sur votre API Laravel

**Timeout ou connexion refusée**
- Vérifiez que l'API est accessible depuis votre machine
- Vérifiez qu'il n'y a pas de firewall bloquant

## Test manuel via CLI

Pour tester manuellement le serveur MCP sans Claude Desktop :

```bash
# Démarrez le serveur
npm start

# Dans un autre terminal, envoyez des commandes JSON via stdin
# (Pour utilisateurs avancés uniquement)
```

Le serveur utilise le protocole stdio, donc il attend des messages JSON-RPC sur stdin et répond sur stdout.
