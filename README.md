# <img src="logo.svg" width="36" height="36" align="center" alt="Logo Hector" /> HECTOR — Optimiseur de Stock Min / Max Saisonnier

**Hector** est une application web autonome et moderne conçue pour calculer automatiquement les niveaux de réapprovisionnement optimaux (**Stock Min**, **Stock Max**, **Stock de Sécurité**) pour tous vos produits, avec distinction claire des **ventes passées réelles** et **extrapolations prévisionnelles saisonnières**.

L'application est disponible en ligne sur : **[https://tom1103.github.io/hector/](https://tom1103.github.io/hector/)**

---

## ✨ Nouveautés Majeures de la Version 2.2 Pro

1. **Ventes Passées ("Déjà Vendu") vs Prévisions Extrapolées :**
   - Suivi précis des mois réels observés (ex: 5 mois d'historique pour un commerce récent).
   - Extrapolation mathématique sur les mois futurs à partir du rythme de vente de base et des coefficients saisonniers configurables :
     - **Black Friday (Novembre) :** $\times 1.20$ (+20% par défaut)
     - **Fêtes / Noël (Décembre) :** $\times 1.60$ (+60% par défaut)
   - Visualisation distincte sur les graphiques (barres pleines bleues pour le réel, violettes pour le prévisionnel) et les tableaux (`[🟢 Déjà Vendu]` vs `[🔮 Prévision]`).
2. **Combobox de Recherche Intelligente d'Articles :**
   - Champ de saisie dynamique avec autocomplétion instantanée.
   - Affiche en direct le badge saisonnier et les volumes réels / prévus de chaque référence.
   - Raccourcis clavier (flèches, Entrée, Échap) et bouton d'effacement rapide.
3. **Référentiel Supply Chain Rigoureux & Fiche Décisionnelle :**
   - Section dédiée avec formules mathématiques et règles d'or opérationnelles pour le **Stock de Sécurité ($SS$)**, le **Stock Minimum ($Min$)**, le **Stock Maximum ($Max$)** et le **Lot de Réassort ($Q$)**.
   - Fiche décisionnelle générée pour chaque article avec consignes en français clair : quand commander, combien commander et quel seuil ne jamais dépasser.
4. **Double Mode de Regroupement :**
   - **📦 Vue par Référence :** fiche article 12 mois et synthèse globale du catalogue.
   - **📅 Vue par Date / Mois :** plan de commande global pour n'importe quel mois de l'année.
5. **Encodage & Accents Français 100% Garantis :**
   - Détection automatique UTF-8 / Windows-1252 (ANSI) / ISO-8859-1.
   - Module anti-mojibake et export CSV avec BOM UTF-8 (`\uFEFF`) pour Excel sous Windows.

---

## 🚀 1. Utilisation Immédiate (En Local ou en Ligne)

Hector fonctionne sur **tous les ordinateurs** sans aucune installation :
1. **En ligne :** Ouvrez simplement [tom1103.github.io/hector](https://tom1103.github.io/hector/).
2. **En local :** Ouvrez le fichier `index.html` dans n'importe quel navigateur (Chrome, Edge, Firefox, Safari).
3. Cliquez sur **"Charger démo"** pour tester le cas réel d'un commerce ayant 5 mois d'historique et des extrapolations sur Black Friday et Noël.

---

## 📐 2. Référentiel Mathématique Supply Chain

### A. Stock de Sécurité Dynamique ($SS_m$)
$$SS_m = \lceil Z \times \sigma_{\text{jour}, m} \times \sqrt{L} \rceil$$
- $Z$ : Facteur de niveau de service (par défaut 1,65 pour 95 % de disponibilité).
- $\sigma_{\text{jour}, m}$ : Écart-type journalier estimé pour le mois $m$.
- $L$ : Délai de livraison fournisseur en jours (7 jours).

### B. Stock Minimum ($Min_m$ — Point de Commande)
$$Min_m = \lceil \text{Consommation Prévue sur le Délai } L + SS_m \rceil$$
Dès que $\text{Stock Disponible} \le Min_m$, le gestionnaire doit impérativement passer commande.

### C. Stock Maximum ($Max_m$ — Plafond de Recomplètement)
$$Max_m = Min_m + \text{Lot de Réassort}$$
où le lot de réassort correspond à la consommation sur la fréquence de commande périodique $P$ (7 jours).

---

## 🔒 Confidentialité & Sécurité

**100% Client-Side :** L'intégralité du traitement des données s'exécute localement dans la mémoire de votre navigateur. Aucune donnée commerciale n'est transmise ni stockée sur un quelconque serveur externe.
