# Site d'appartements 4½ à Montréal (GitHub Pages)

Ce dépôt contient un site statique (sans build) pour explorer des annonces d'appartements 4½ à Montréal destinées à deux jeunes professionnels (26 ans) qui travaillent surtout de la maison au centre‑ville.

Le site est en français, au ton chaleureux (typographies Fraunces + Outfit), et met l’accent sur:
- **Budget**: 2000–2500 $ CAD / mois
- **Type**: 4½ avec au moins 2 chambres fermées (ou bureau)
- **Quartiers**: Plateau Mont‑Royal, Rosemont, Petite‑Patrie, Verdun, Ahuntsic, Centre‑ville (Ville‑Marie). Ouverts aux zones voisines (Mile End, Saint‑Henri, Griffintown) si présentes dans les données.
- **Qualité**: lumineux, rénové; pas de sous‑sol
- **Sources**: Kijiji et Facebook Marketplace

## Contenu du dépôt

- `index.html` — page principale (héros, barre de filtres collante, cartes d’annonces, modal de détails)
- `styles.css` — styles du site (responsive, accessible)
- `script.js` — logique de tri/filtre, rendu, modal & carrousel (clavier inclus)
- `listings.json` — données des annonces (départ: tableau vide `[]`)
- `.nojekyll` — pour que GitHub Pages n’applique pas Jekyll

## Activer GitHub Pages

1. Ouvrir les paramètres du dépôt: Settings → Pages  
2. Dans “Build and deployment”, choisir:
   - Source: “Deploy from a branch”
   - Branche: `main`
   - Dossier: `/ (root)`
3. Sauvegarder. L’URL de votre site s’affichera après le premier déploiement.

Le site est purement statique (pas de npm, pas de build). GitHub Pages sert directement les fichiers à la racine.

## Ajouter des annonces réelles

Éditez le fichier `listings.json` à la racine. Le schéma par annonce est:

```json
{
  "id": "kijiji-123",
  "source": "kijiji",
  "title": "",
  "price": 2300,
  "neighborhood": "Plateau Mont-Royal",
  "address": "",
  "bedrooms": 2,
  "bathrooms": 1,
  "sqft": null,
  "bright": true,
  "basement": false,
  "high_end_notes": "",
  "description": "",
  "url": "https://...",
  "photos": ["https://...", "https://...", "https://..."],
  "posted": ""
}
```

Conseils:
- N’ajoutez aucune annonce inventée. Utilisez des URL et des photos réelles (hotlink autorisé).  
- Si une photo ne charge pas, une image de remplacement élégante est affichée automatiquement.
- Les annonces peuvent être filtrées par **quartier** et par **source** (Kijiji / Marketplace).  
- Le tri fonctionne par **prix** (↑/↓) et par **quartier** (A→Z / Z→A).  
- Les cartes affichent un mini‑grille d’au moins 3 photos; un clic ouvre une **vue détaillée** avec carrousel (clavier: flèches gauche/droite, `Échap` pour fermer).

## Accessibilité & performance

- Images en lazy‑loading, `decoding="async"`, focus visible, carrousel pilotable au **clavier**.  
- Mise en page responsive, contrastes soignés, contenu francophone.

## Mentions

Pied de page: **dernière mise à jour** et **disclaimer** (“annonces = instantanés, peuvent être parties”).  
Aucune dépendance externe autre que Google Fonts.

# appartements-montreal
4½ à Montréal — Plateau, Rosemont, Verdun, Petite-Patrie, Ahuntsic, centre-ville. 2000–2500$. GitHub Pages.
