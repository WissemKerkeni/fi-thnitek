import type { Catalog } from './types.js';

export const ar: Catalog = {
  app: {
    name: 'في ثنيتك',
  },
  common: {
    retry: 'عاود',
    continue: 'كمّل',
    error: 'صار مشكل',
  },
  language: {
    title: 'اختار اللغة',
    arabic: 'العربية',
    french: 'Français',
  },
  health: {
    title: 'حالة الخدمة',
    checking: 'قاعدين نثبتو…',
    up: 'الخدمة خدّامة',
    down: 'الخدمة موش متوفرة',
    database: 'قاعدة البيانات',
    version: 'النسخة',
  },
  map: {
    title: 'الخريطة',
    attribution: '© OpenStreetMap',
  },
  auth: {
    title: 'مرحبا بيك',
    subtitle: 'خريطة مشتركة للتاكسي واللواج والكار.',
    google: 'كمّل بـ Google',
    failed: 'ما نجمناش ندخلوك. عاود.',
    notConfigured: 'الدخول بـ Google مازال موش مضبوط.',
    suspended: 'حسابك موقوف.',
    banned: 'حسابك محظور.',
  },
  onboarding: {
    termsTitle: 'الشروط والخصوصية',
    termsDraft: 'نسخة مبدئية، تستنى المراجعة القانونية.',
    termsLocation: 'ما نستعملوش بلاصتك كان وقت إلي طلبك مفتوح ولا وقت إلي تشارك كسواق.',
    termsAnonymous: 'السواقة ما يشوفوش اسمك كان إذا انت تختار.',
    termsNoHistory: 'ما نخزنوش تاريخ تحركاتك.',
    termsFree: 'الخدمة مجانية: لا حجز، لا خلاص.',
    accept: 'موافق',
    nameTitle: 'اسمك',
    nameHint: 'السواقة ما يشوفوهش كان إذا انت تختار.',
    namePlaceholder: 'مثلا: سامي',
    nameInvalid: 'من 2 حتى 40 حرف',
  },
  me: {
    greeting: 'عسلامة {{name}}',
    signOut: 'اخرج',
    deleteAccount: 'امسح حسابي',
    deleteConfirmTitle: 'تمسح الحساب؟',
    deleteConfirmBody: 'بياناتك وأجهزتك باش يتمحاو. ما تنجمش ترجع.',
    cancel: 'بطّل',
    confirmDelete: 'امسح',
  },
};
