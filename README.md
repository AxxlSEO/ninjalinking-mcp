# NinjaLinking MCP Server

Serveur MCP local `stdio` pour consulter et gérer les commandes NinjaLinking depuis Claude Desktop, Claude Code ou Codex.

Ce package n’est pas une app ChatGPT. Une intégration ChatGPT multi-utilisateur nécessite un serveur HTTPS `/mcp` et OAuth 2.1 séparés.

## Prérequis

- Node.js 20 ou 22
- Une clé API NinjaLinking récente, générée depuis `/api-access`
- La version backend qui expose `/api/integrations/v1`

Les clés créées avant la version 2.1 n’ont que `orders:read/orders:write`. Elles peuvent encore lire via le fallback transitoire, mais doivent être régénérées pour les previews et écritures sécurisées.

## Installation locale avant publication npm

```bash
git clone https://github.com/AxxlSEO/ninjalinking-mcp.git
cd ninjalinking-mcp
npm ci
npm test
```

Configuration Claude Desktop :

```json
{
  "mcpServers": {
    "ninjalinking": {
      "command": "node",
      "args": ["/CHEMIN/ninjalinking-mcp/dist/index.js"],
      "env": {
        "NINJALINKING_API_TOKEN": "VOTRE_CLE_API"
      }
    }
  }
}
```

`NINJALINKING_API_URL` est optionnelle et vaut `https://app.linkontext.com` par défaut (l'ancien `https://app.ninjalinking.fr` reste accepté, l'API y est toujours servie). Un autre hôte exige `NINJALINKING_ALLOW_CUSTOM_HOST=true`. HTTP n’est accepté que pour localhost.

## Flux sécurisé des écritures

Une action dépensière se fait toujours en deux appels :

1. `preview_order`, `preview_order_payment` ou `preview_delegation` calcule l’impact et retourne un `confirmation_token` valable 10 minutes ;
2. après confirmation utilisateur, le commit correspondant reçoit le même payload, ce token et une `idempotency_key` stable.

Un replay avec la même clé retourne le premier résultat sans recréer la commande ni redébiter les crédits. Les POST ne sont jamais retentés automatiquement par le client MCP.

## Outils

| Lecture | Preview | Commit |
|---|---|---|
| `get_profile` | `preview_order` | `create_order` |
| `get_credits` | `preview_order_payment` | `pay_order` |
| `get_credit_history` | `preview_delegation` | `create_delegation` |
| `get_available_packs` | | |
| `list_orders`, `get_order`, `get_link` | | |
| `list_delegations`, `get_delegation` | | |

Les listes sont paginées de 1 à 100 éléments. Les réponses excluent les emails, relations internes et identifiants Stripe.

## Développement

```bash
npm run build
npm test
npm run test:coverage
npm run smoke:pack
npm audit --omit=dev
```

La publication npm est déclenchée par un tag `vX.Y.Z` après validation explicite du premier publish et configuration du trusted publishing npm.

## Support
- Documentation : [app.linkontext.com/api-access](https://app.linkontext.com/api-access)
- Contact : axelguyennot@ninjalinking.fr
