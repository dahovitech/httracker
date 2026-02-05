# HTTracker - Extension Chrome Premium

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Chrome](https://img.shields.io/badge/Chrome-Extension-yellow.svg)

**HTTracker** est une extension Chrome puissante permettant de télécharger des sites web entiers pour une utilisation hors ligne. Cette version Premium offre des fonctionnalités avancées pour un téléchargement efficace et complet.

## Fonctionnalités

### Téléchargement Intelligent
- Crawl récursif avec profondeur configurable (0-10 niveaux)
- Téléchargements parallèles (1-20 simultanés)
- Extraction automatique de toutes les ressources (HTML, CSS, JS, images, fonts, vidéos, audio)
- Réécriture automatique des URLs pour fonctionnement hors ligne

### Interface Utilisateur Premium
- Sidebar moderne avec thème sombre/clair
- Progression en temps réel avec logs détaillés
- Historique des téléchargements
- Statistiques et analytics

### Options Avancées
- Respect des règles robots.txt
- Délai configurable entre les requêtes
- Timeout et taille max des fichiers
- Support des cookies pour sites authentifiés
- Export en ZIP ou MHTML

## Installation

### Depuis les sources

1. Clonez ce dépôt :
```bash
git clone https://github.com/dahovitech/httracker.git
```

2. Ouvrez Chrome et accédez à `chrome://extensions/`

3. Activez le **Mode développeur** (coin supérieur droit)

4. Cliquez sur **Charger l'extension non empaquetée**

5. Sélectionnez le dossier `httracker`

## Utilisation

1. Cliquez sur l'icône HTTracker dans la barre d'outils Chrome
2. Le panneau latéral s'ouvre automatiquement
3. Entrez l'URL du site à télécharger ou utilisez l'URL de la page actuelle
4. Configurez les options (profondeur, parallélisme, types de ressources)
5. Cliquez sur **Démarrer le téléchargement**
6. Suivez la progression en temps réel
7. Le fichier ZIP se télécharge automatiquement à la fin

## Structure du Projet

```
httracker/
├── manifest.json          # Configuration de l'extension
├── sidepanel.html         # Interface utilisateur (sidebar)
├── icons/                 # Icônes de l'extension
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── styles/
│   └── sidepanel.css      # Styles de l'interface
├── scripts/
│   ├── background.js      # Service Worker (logique principale)
│   ├── sidepanel.js       # Script de l'interface
│   └── content.js         # Script injecté dans les pages
└── lib/
    └── jszip.min.js       # Bibliothèque de compression ZIP
```

## Configuration

### Paramètres de Téléchargement

| Option | Description | Défaut |
|--------|-------------|--------|
| Profondeur | Niveaux de liens à suivre | 2 |
| Parallèle | Téléchargements simultanés | 5 |
| Délai | Pause entre requêtes (ms) | 100 |
| Timeout | Temps max par fichier (s) | 30 |
| Taille max | Limite par fichier (MB) | 50 |

### Types de Ressources

- **HTML** : Pages web
- **CSS** : Feuilles de style
- **JS** : Scripts JavaScript
- **Images** : PNG, JPG, GIF, WebP, SVG
- **Fonts** : WOFF, WOFF2, TTF, OTF
- **Vidéos** : MP4, WebM
- **Audio** : MP3, WAV, OGG

## Permissions Requises

- `activeTab` : Accès à l'onglet actif
- `downloads` : Téléchargement de fichiers
- `storage` : Stockage des paramètres
- `tabs` : Information sur les onglets
- `scripting` : Injection de scripts
- `webRequest` : Analyse des requêtes
- `cookies` : Support de l'authentification

## Limitations Connues

- Les sites avec protection anti-bot peuvent bloquer le téléchargement
- Les ressources nécessitant une authentification avancée peuvent ne pas être accessibles
- Les sites SPA (Single Page Application) très dynamiques peuvent nécessiter des ajustements

## Développement

### Prérequis
- Chrome 116+ (pour Side Panel API)
- Node.js (optionnel, pour les tests)

### Contribuer

1. Fork le projet
2. Créez une branche (`git checkout -b feature/amelioration`)
3. Committez vos changements (`git commit -am 'Ajout de fonctionnalité'`)
4. Push la branche (`git push origin feature/amelioration`)
5. Ouvrez une Pull Request

## Licence

Ce projet est sous licence MIT. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

## Auteur

Développé par **@jprud67**

---

**HTTracker Premium** - Téléchargez le web, emportez-le partout.
