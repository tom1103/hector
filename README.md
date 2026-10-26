# <img src="logo.svg" width="36" height="36" align="center" alt="Logo Hector" /> HECTOR — Optimiseur de Stock Min / Max Saisonnier

**Hector** est une application web autonome et moderne conçue pour calculer automatiquement les niveaux de réapprovisionnement optimaux (**Stock Min**, **Stock Max**, **Stock de Sécurité**) pour tous vos produits, avec détection intelligente des saisonnalités.

L'application est disponible en ligne sur : **[https://tom1103.github.io/hector/](https://tom1103.github.io/hector/)**

---

## ✨ Nouveautés de la Version 2.1

1. **Logo & Identité Visuelle :**
   - Logo vectoriel officiel SVG intégré dans l'en-tête et en favicon de navigateur.
2. **Double Mode d'Analyse (Regroupement Référence vs Date) :**
   - **📦 Regrouper par Référence (Vue Article) :** Analyse approfondie d'un produit sélectionné sur les 12 mois de l'année, courbe dynamique Chart.js, et tableau de synthèse de tout le catalogue.
   - **📅 Regrouper par Date / Mois (Vue Calendrier & Plan de Réassort) :** Sélection d'un mois en un clic (Janvier à Décembre avec indicateurs Black Friday, Fêtes, Été). Présentation du plan de commande global pour ce mois, Top 10 des stocks Min/Max, et export direct du bon de commande mensuel.
3. **Gestion Avancée des Encodages & Préservation des Accents :**
   - Détection automatique de l'encodage des fichiers déposés : **UTF-8**, **Windows-1252 (ANSI)** ou **ISO-8859-1** (fréquents dans les exports Excel français).
   - Module anti-mojibake automatique pour restaurer les caractères accentués (`é`, `è`, `à`, `ê`, `î`, `ô`, `ù`, `ç`, `°`, `€`).
   - Export CSV enrichi du **BOM UTF-8 (`\uFEFF`)** pour une ouverture native et sans corruption dans Microsoft Excel sous Windows.
4. **Paramétrage Réapprovisionnement Rapide :**
   - Configuration par défaut calée sur un cycle hebdomadaire : Délai fournisseur de **7 jours** et Fréquence de commande de **7 jours**.

---

## 🚀 1. Utilisation Immédiate (En Local ou en Ligne)

Hector fonctionne sur **tous les ordinateurs** sans aucune installation :
1. **En ligne :** Ouvrez simplement [tom1103.github.io/hector](https://tom1103.github.io/hector/).
2. **En local :** Ouvrez le fichier `index.html` dans n'importe quel navigateur (Chrome, Edge, Firefox, Safari).
3. Cliquez sur **"Charger démo"** pour visualiser le fonctionnement ou glissez vos propres fichiers de ventes (Excel ou CSV).

---

## 📐 2. Modèle Mathématique de Calcul

### A. Détection de la Saisonnalité
Pour chaque article, Hector calcule le profil mensuel et le ratio d'amplitude :
$$\text{Ratio} = \frac{\max(\text{Ventes Mensuelles})}{\min(\text{Ventes Mensuelles})}$$
Si ce ratio dépasse le seuil configuré (par défaut $1{,}40$), le produit est qualifié de **Saisonnier**.

### B. Anticipation du Délai Fournisseur ($L$)
Une commande passée en mois $M$ doit couvrir les ventes pendant le délai de livraison $L$. Hector projette la consommation sur la fenêtre calendaire réelle pour que le stock arrive *avant* le pic de saison.

### C. Stock de Sécurité Dynamique ($SS_m$)
$$SS_m = \lceil Z \times \sigma_{\text{jour}, m} \times \sqrt{L} \rceil$$
- $Z$ : Facteur de niveau de service (par défaut 1,65 pour 95 % de disponibilité).
- $\sigma_{\text{jour}, m}$ : Écart-type journalier estimé pour le mois $m$.
- $L$ : Délai de livraison fournisseur en jours.

### D. Stock Minimum ($Min_m$ - Point de Commande)
$$Min_m = \lceil \text{Consommation Prévue sur le Délai } L + SS_m \rceil$$

### E. Stock Maximum ($Max_m$ - Plafond de Recomplètement)
$$Max_m = Min_m + \text{Lot de Réassort}$$
où le lot de réassort correspond à la consommation sur la fréquence de commande périodique $P$ (ex: 7 jours).

---

## 🔒 Confidentialité & Sécurité

**100% Client-Side :** L'intégralité du traitement des données s'exécute localement dans la mémoire de votre navigateur. Aucune donnée commerciale n'est transmise ni stockée sur un quelconque serveur externe.
