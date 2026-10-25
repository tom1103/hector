# 📦 HECTOR — Optimiseur de Stock Min / Max Saisonnier

**Hector** est une application web autonome et légère conçue pour calculer automatiquement les niveaux de réapprovisionnement optimaux (**Stock Min**, **Stock Max**, **Stock de Sécurité**) pour les catalogues de produits soumis ou non à des saisonnalités.

---

## 🚀 1. Utilisation Immédiate (En Local)

Hector fonctionne sur **100% des ordinateurs** sans aucune installation préalable :
1. Rendez-vous dans le dossier `hector/`.
2. Faites un **double-clic sur `index.html`**.
3. L'application s'ouvre directement dans votre navigateur web habituel (Chrome, Edge, Firefox, Safari...).
4. Cliquez sur **"Charger démo"** pour observer immédiatement les graphiques et calculs, ou glissez votre propre fichier Excel / CSV.

---

## 🌐 2. Déploiement Gratuit sur GitHub Pages (En 1 minute)

Pour rendre Hector accessible à toute votre équipe via une URL web publique ou privée :

1. Créez un nouveau dépôt sur GitHub nommé `hector`.
2. Déposez-y tous les fichiers du dossier (`index.html`, `style.css`, `app.js`, `sample-data.csv`, `README.md`).
3. Allez dans l'onglet **Settings** du dépôt > rubrique **Pages** (dans le menu de gauche).
4. Sous **Build and deployment** :
   - Source : `Deploy from a branch`
   - Branch : `main` / `root`
   - Cliquez sur **Save**.
5. Votre application sera disponible en ligne à l'adresse :  
   `https://<votre-compte-github>.github.io/hector/`

---

## 📐 3. Modèle Mathématique de Calcul

### A. Détection de la Saisonnalité
Pour chaque article, Hector calcule le profil mensuel et le ratio d'amplitude :
$$\text{Ratio} = \frac{\max(\text{Ventes Mensuelles})}{\min(\text{Ventes Mensuelles})}$$
Si ce ratio dépasse le seuil configuré (par défaut $1{,}40$), le produit est qualifié de **Saisonnier**.

### B. Anticipation du Délai Fournisseur ($L$)
Une erreur classique en saisonnalité consiste à calculer le seuil avec la demande du mois en cours. Si le délai est de 30 jours et que le pic arrive en juillet, la commande passée en juin doit couvrir **la demande de juillet** !  
Hector intègre une fenêtre de projection glissante pour dimensionner le besoin en stock sur la période exacte de livraison.

### C. Stock de Sécurité Dynamique ($SS_m$)
$$SS_m = \lceil Z \times \sigma_{\text{jour}, m} \times \sqrt{L} \rceil$$
- $Z$ : Facteur de niveau de service (ex: 1,65 pour 95 % de disponibilité).
- $\sigma_{\text{jour}, m}$ : Écart-type journalier de la demande au mois $m$.
- $L$ : Délai de livraison fournisseur en jours.

### D. Stock Minimum ($Min_m$ - Point de Commande)
$$Min_m = \lceil \text{Consommation Prévue sur le Délai } L + SS_m \rceil$$

### E. Stock Maximum ($Max_m$ - Plafond de Recomplètement)
$$Max_m = Min_m + \text{Lot de Réassort}$$
où le lot de réassort correspond à la consommation sur la fréquence de commande périodique $P$ (ex: 15 jours).

---

## 📊 4. Fonctionnalités Principales

- **Détection Automatique des Formats :**
  - Format Matrice : Colonnes `[Produit, Janvier, Février, ..., Décembre]`.
  - Format Lignes / Transactionnel : Colonnes `[Date/Mois, Produit, Quantité]`.
- **Générateur de Modèle Excel :** Bouton intégré pour télécharger une matrice vierge pré-remplie.
- **Graphiques Interactifs :** Visualisation mois par mois des courbes Min, Max, Stock de Sécurité et Ventes.
- **Exports ERP :** Export complet au format `.xlsx` (avec onglet synthèse et onglet détail mensuel) ou `.csv`.
- **Confidentialité Totale :** 100% du traitement se fait dans la mémoire du navigateur client. Aucune donnée commerciale n'est transmise sur Internet.
