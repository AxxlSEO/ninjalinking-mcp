# NinjaLinking MCP Server

Serveur MCP (Model Context Protocol) pour l'API NinjaLinking. Permet à Claude, ChatGPT et tout assistant IA compatible MCP de passer des commandes de backlinks, gérer les crédits et suivre les commandes.

## Installation rapide

### Claude Code

Ajoutez dans `~/.claude.json` :

```json
{
  "mcpServers": {
    "ninjalinking": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "github:AxxlSEO/ninjalinking-mcp"],
      "env": {
        "NINJALINKING_API_URL": "https://app.ninjalinking.fr",
        "NINJALINKING_API_TOKEN": "VOTRE_CLE_API"
      }
    }
  }
}
```

### Claude Desktop

Ajoutez dans votre `claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "ninjalinking": {
      "command": "npx",
      "args": ["-y", "github:AxxlSEO/ninjalinking-mcp"],
      "env": {
        "NINJALINKING_API_URL": "https://app.ninjalinking.fr",
        "NINJALINKING_API_TOKEN": "VOTRE_CLE_API"
      }
    }
  }
}
```

### Obtenir votre clé API

1. Connectez-vous sur [app.ninjalinking.fr](https://app.ninjalinking.fr)
2. Allez dans **Accès API** (`/api-access`)
3. Cliquez sur **Générer ma clé API**
4. Copiez la clé affichée (elle n'est affichée qu'une seule fois)

## Outils disponibles

### Compte & crédits

| Outil | Description |
|-------|-------------|
| `get_profile` | Profil du compte (nom, email, crédits, rôle) |
| `get_credits` | Solde de crédits actuel |
| `get_credit_history` | Historique des transactions de crédits |
| `get_available_packs` | Packs de crédits disponibles avec prix |

### Commandes

| Outil | Description |
|-------|-------------|
| `list_orders` | Lister les commandes (filtres: statut, recherche) |
| `get_order` | Détails d'une commande et ses liens |
| `create_order` | Créer une commande de backlinks (1 lien = 1 crédit) |
| `pay_order` | Payer une commande impayée avec le solde de crédits |
| `get_link` | Détail d'un lien et son statut de vérification |

### Délégations

| Outil | Description |
|-------|-------------|
| `list_delegations` | Lister les commandes en délégation |
| `get_delegation` | Détails d'une commande en délégation |
| `create_delegation` | Créer une délégation (campagne clé en main) |

## Exemples d'utilisation

Une fois configuré, parlez à votre assistant IA :

- *"Commande 5 backlinks pour monsite.fr avec des ancres exactes, livraison mai 2026"*
- *"Montre-moi l'état de mes commandes en cours"*
- *"Combien de crédits il me reste ?"*
- *"Crée une délégation de 20 liens pour monsite.fr en paiement mensuel"*

## Détails des outils

### create_order

Crée une commande de backlinks. Chaque lien coûte 1 crédit.

**Paramètres :**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `label` | string | Non | Nom de la commande |
| `customer_email` | string | Non | Admin uniquement : passer la commande au nom du client ayant cet email |
| `links` | array | Oui | Liens à commander (max 55 au total) |
| `links[].page_target` | string | Oui | URL cible du backlink |
| `links[].anchor_type` | string | Oui | Ancre ou type d'ancre (texte libre) |
| `links[].delivery_date` | string | Non | Mois de livraison (format `YYYY-MM`) |
| `links[].comment` | string | Non | Instructions supplémentaires |
| `links[].qty` | number | Non | Nombre de backlinks (défaut: 1) |

Si le solde de crédits est suffisant, ils sont débités automatiquement. Sinon, la commande est créée avec le statut `unpaid`.

### create_delegation

Crée une commande en délégation (campagne clé en main gérée par NinjaLinking).

**Paramètres :**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `details` | string | Oui | Description du projet et objectifs |
| `site` | string[] | Oui | URLs des sites cibles |
| `qty` | number | Oui | Nombre de backlinks souhaités (max 199) |
| `budget` | number | Non | Indication de budget en euros |
| `payment_mode` | string | Oui | `onetime` ou `monthly` |

Retourne une URL Stripe pour le paiement.

### list_orders

**Paramètres optionnels :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `status` | string | Filtrer : `unpaid`, `paid`, `pending`, `in_control`, `complete` |
| `search` | string | Recherche dans numéro, label, URL, ancre |
| `page_size` | number | Résultats par page (défaut: 50, `-1` pour tout) |

## Variables d'environnement

| Variable | Requis | Description |
|----------|--------|-------------|
| `NINJALINKING_API_URL` | Oui | `https://app.ninjalinking.fr` |
| `NINJALINKING_API_TOKEN` | Oui | Clé API générée depuis votre compte |

## Développement

```bash
git clone https://github.com/AxxlSEO/ninjalinking-mcp.git
cd ninjalinking-mcp
npm install
cp .env.example .env  # Remplir avec vos credentials
npm run build
npm run dev           # Build + lancer le serveur
```

## Support

- Documentation : [app.ninjalinking.fr/api-access](https://app.ninjalinking.fr/api-access)
- Contact : support@ninjalinking.fr
