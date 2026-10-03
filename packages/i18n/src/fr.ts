/** French catalog: the source of truth for the key shape. */
export const fr = {
  app: {
    name: 'Fi thnitek',
  },
  common: {
    retry: 'Réessayer',
    continue: 'Continuer',
    error: 'Une erreur est survenue',
  },
  language: {
    title: 'Choisissez votre langue',
    arabic: 'العربية',
    french: 'Français',
  },
  health: {
    title: 'État du service',
    checking: 'Vérification…',
    up: 'Le service fonctionne',
    down: 'Le service est indisponible',
    database: 'Base de données',
    version: 'Version',
  },
  map: {
    title: 'Carte',
    attribution: '© OpenStreetMap',
  },
  auth: {
    title: 'Bienvenue',
    subtitle: 'La carte partagée des taxis, louages et bus.',
    google: 'Continuer avec Google',
    failed: 'La connexion a échoué. Réessayez.',
    notConfigured: "La connexion Google n'est pas encore configurée.",
    suspended: 'Votre compte est suspendu.',
    banned: 'Votre compte est bloqué.',
  },
  onboarding: {
    termsTitle: 'Conditions et confidentialité',
    termsDraft: 'Version provisoire, en attente de validation juridique.',
    termsLocation: "Votre position n'est utilisée que pendant une demande ouverte ou un partage chauffeur.",
    termsAnonymous: 'Les chauffeurs ne voient votre nom que si vous le choisissez.',
    termsNoHistory: "Nous ne gardons pas l'historique de vos déplacements.",
    termsFree: 'Service gratuit : pas de réservation, pas de paiement.',
    accept: "J'accepte",
    nameTitle: 'Votre prénom',
    nameHint: 'Les chauffeurs ne le voient que si vous le choisissez.',
    namePlaceholder: 'Ex. Sami',
    nameInvalid: '2 à 40 lettres',
  },
  me: {
    greeting: 'Bonjour {{name}}',
    signOut: 'Se déconnecter',
    deleteAccount: 'Supprimer mon compte',
    deleteConfirmTitle: 'Supprimer le compte ?',
    deleteConfirmBody: 'Votre profil et vos appareils seront effacés. Cette action est définitive.',
    cancel: 'Annuler',
    confirmDelete: 'Supprimer',
  },
} as const;
