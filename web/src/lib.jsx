import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

// ================= API =================
// Messages d'erreur du serveur (français) traduits selon la langue choisie.
const SERVER_ERRORS = {
  'Code de remise': { en: 'Delivery code', ar: 'رمز التسليم' },
  'Donnez ce code au livreur à la livraison': { en: 'Give this code to the driver at delivery', ar: 'أعطِ هذا الرمز للمندوب عند التسليم' },
  'Livraison estimée': { en: 'Estimated delivery', ar: 'التوصيل المتوقع' },
  'Arrive dans': { en: 'Arriving in', ar: 'يصل خلال' },
  'Code PIN incorrect — demandez le code au client': { en: 'Wrong PIN — ask the client for the code', ar: 'رمز خاطئ — اطلب الرمز من العميل' },
  'Maximum 5 photos par produit': { en: 'Maximum 5 photos per product', ar: 'بحد أقصى 5 صور لكل منتج' },
  'Nom du magasin requis (ex. : Restaurant Al Nil)': { en: 'Store name required (e.g. Al Nil Restaurant)', ar: 'اسم المتجر مطلوب (مثال: مطعم النيل)' },
  'Téléphone invalide (ex. : 0100 123 4567)': { en: 'Invalid phone (e.g. 0100 123 4567)', ar: 'رقم هاتف غير صالح (مثال: 0100 123 4567)' },
  'Adresse du magasin requise (ex. : 12 rue Saad Zaghloul, Alexandrie)': { en: 'Store address required (e.g. 12 Saad Zaghloul St, Alexandria)', ar: 'عنوان المتجر مطلوب (مثال: 12 شارع سعد زغلول، الإسكندرية)' },
  'Adresse de livraison requise (ex. : 12 rue Saad Zaghloul, Alexandrie)': { en: 'Delivery address required (e.g. 12 Saad Zaghloul St, Alexandria)', ar: 'عنوان التوصيل مطلوب (مثال: 12 شارع سعد زغلول، الإسكندرية)' },
  'Nom du produit requis (ex. : Sandwich falafel)': { en: 'Product name required (e.g. Falafel Sandwich)', ar: 'اسم المنتج مطلوب (مثال: سندويتش فلافل)' },
  'Prix invalide (ex. : 45.50)': { en: 'Invalid price (e.g. 45.50)', ar: 'سعر غير صالح (مثال: 45.50)' },
  'Accès refusé': { en: 'Access denied', ar: 'تم رفض الوصول' },
  'Adresse et téléphone requis': { en: 'Address and phone required', ar: 'العنوان والهاتف مطلوبان' },
  'Attribution automatique : les livraisons publiques vous sont assignées par la plateforme': { en: 'Automatic dispatch: public deliveries are assigned to you by the platform', ar: 'الإسناد التلقائي: المنصّة تسند لك التوصيلات العامة' },
  'Aucun magasin': { en: 'No store', ar: 'لا يوجد متجر' },
  'Vous avez déjà un magasin': { en: 'You already have a store', ar: 'لديك متجر بالفعل' },
  'Email ou téléphone requis': { en: 'Email or phone required', ar: 'البريد أو الهاتف مطلوب' },
  'Téléphone invalide': { en: 'Invalid phone number', ar: 'رقم هاتف غير صالح' },
  'Numéro déjà utilisé': { en: 'Phone number already in use', ar: 'رقم الهاتف مستخدم بالفعل' },
  'Nom requis': { en: 'Name required', ar: 'الاسم مطلوب' },
  'Google non configuré': { en: 'Google sign-in not configured', ar: 'تسجيل الدخول بجوجل غير مُهيأ' },
  'Token Google invalide': { en: 'Invalid Google token', ar: 'رمز جوجل غير صالح' },
  'Email Google non vérifié': { en: 'Google email not verified', ar: 'بريد جوجل غير مُوثق' },
  'Téléphone requis': { en: 'Phone number required', ar: 'رقم الهاتف مطلوب' },
  'Adresse du magasin requise': { en: 'Store address required', ar: 'عنوان المتجر مطلوب' },
  'Cette livraison est réservée aux livreurs du magasin': { en: 'This delivery is reserved for the store’s drivers', ar: 'هذه التوصيلة محجزة لسائقي المتجر' },
  'Cette livraison n’est plus disponible': { en: 'This delivery is no longer available', ar: 'هذه التوصيلة لم تعد متاحة' },
  'Champs manquants': { en: 'Missing fields', ar: 'حقول ناقصة' },
  'Code déjà utilisé': { en: 'Code already used', ar: 'الرمز مستخدم من قبل' },
  'Code introuvable': { en: 'Code not found', ar: 'الرمز غير موجود' },
  'Code invalide ou expiré': { en: 'Invalid or expired code', ar: 'رمز غير صالح أو منتهي' },
  'Code invalide': { en: 'Invalid code', ar: 'رمز غير صالح' },
  'Code promo invalide ou expiré': { en: 'Invalid or expired promo code', ar: 'كود خصم غير صالح أو منتهي' },
  'Code trop court (min 3)': { en: 'Code too short (min 3)', ar: 'الرمز قصير جداً (3 على الأقل)' },
  'Code épuisé': { en: 'Code fully used', ar: 'استُنفد الرمز' },
  'Commande déjà notée': { en: 'Order already rated', ar: 'تم تقييم الطلب سابقاً' },
  'Commande introuvable': { en: 'Order not found', ar: 'الطلب غير موجود' },
  'Commande non livrée': { en: 'Order not delivered yet', ar: 'الطلب لم يُسلَّم بعد' },
  'Compte en attente de validation': { en: 'Account pending approval', ar: 'الحساب في انتظار الموافقة' },
  'Compte non validé': { en: 'Account not approved', ar: 'الحساب غير مُعتمد' },
  'Compte suspendu': { en: 'Account suspended', ar: 'الحساب موقوف' },
  'Compte suspendu, contactez le support': { en: 'Account suspended, contact support', ar: 'الحساب موقوف، تواصل مع الدعم' },
  'Coordonnées invalides': { en: 'Invalid coordinates', ar: 'إحداثيات غير صالحة' },
  'Email déjà utilisé': { en: 'Email already in use', ar: 'البريد الإلكتروني مستخدم' },
  'Email ou mot de passe incorrect': { en: 'Incorrect email or password', ar: 'بريد إلكتروني أو كلمة مرور غير صحيحة' },
  'Email valide requis': { en: 'Valid email required', ar: 'بريد إلكتروني صحيح مطلوب' },
  'Erreur serveur': { en: 'Server error — please retry', ar: 'خطأ في الخادم — أعد المحاولة' },
  'Image invalide (PNG/JPG/WebP) ou trop lourde': { en: 'Invalid image (PNG/JPG/WebP) or too large', ar: 'صورة غير صالحة (PNG/JPG/WebP) أو كبيرة جداً' },
  'Impossible de modifier un super admin': { en: 'Cannot modify a super admin', ar: 'لا يمكن تعديل المدير العام' },
  'La commande doit être prête et non attribuée': { en: 'The order must be ready and unassigned', ar: 'يجب أن يكون الطلب جاهزاً وغير مُسند' },
  'Livreur en course — attendez la fin de la livraison': { en: 'Driver on a delivery — wait until it is finished', ar: 'السائق في توصيلة — انتظر انتهاءها' },
  'Livreur introuvable parmi vos livreurs personnels': { en: 'Driver not found among your personal drivers', ar: 'السائق غير موجود ضمن سائقيك الشخصيين' },
  'Livreur introuvable': { en: 'Driver not found', ar: 'السائق غير موجود' },
  'Magasin fermé actuellement': { en: 'Store currently closed', ar: 'المتجر مغلق حالياً' },
  'Magasin indisponible': { en: 'Store unavailable', ar: 'المتجر غير متاح' },
  'Magasin introuvable': { en: 'Store not found', ar: 'المتجر غير موجود' },
  'Message vide': { en: 'Empty message', ar: 'رسالة فارغة' },
  'Mot de passe actuel incorrect': { en: 'Current password is incorrect', ar: 'كلمة المرور الحالية غير صحيحة' },
  'Mot de passe trop court (min 5)': { en: 'Password too short (min 5)', ar: 'كلمة المرور قصيرة جداً (5 أحرف على الأقل)' },
  'Nom du magasin requis': { en: 'Store name required', ar: 'اسم المتجر مطلوب' },
  'Nom et email valides requis': { en: 'Valid name and email required', ar: 'الاسم والبريد الصحيحان مطلوبان' },
  'Nom et mot de passe (min 5 caractères) requis': { en: 'Name and password (min 5 characters) required', ar: 'الاسم وكلمة المرور (5 أحرف على الأقل) مطلوبان' },
  'Nom et prix valides requis': { en: 'Valid name and price required', ar: 'الاسم والسعر الصحيحان مطلوبان' },
  'Non authentifié': { en: 'Please sign in', ar: 'يرجى تسجيل الدخول' },
  'Note du magasin requise': { en: 'Store rating required', ar: 'تقييم المتجر مطلوب' },
  'Panier vide': { en: 'Empty cart', ar: 'السلة فارغة' },
  'Photo introuvable': { en: 'Photo not found', ar: 'الصورة غير موجودة' },
  'Produit indisponible': { en: 'Product unavailable', ar: 'المنتج غير متاح' },
  'Produit introuvable': { en: 'Product not found', ar: 'المنتج غير موجود' },
  'Publication modifiable seulement quand la commande est prête': { en: 'Visibility can be changed only when the order is ready', ar: 'يمكن تغيير النشر فقط عندما يكون الطلب جاهزاً' },
  'Requête trop volumineuse (max 8 Mo)': { en: 'Request too large (max 8 MB)', ar: 'الطلب كبير جداً (8 ميجابايت كحد أقصى)' },
  'Rôle invalide': { en: 'Invalid role', ar: 'دور غير صالح' },
  'Seul un magasin en attente peut être refusé': { en: 'Only a pending store can be rejected', ar: 'يمكن رفض المتاجر المعلّقة فقط' },
  'Statut invalide': { en: 'Invalid status', ar: 'حالة غير صالحة' },
  'Subscription invalide': { en: 'Invalid subscription', ar: 'اشتراك غير صالح' },
  'Trop de tentatives. Réessayez dans quelques minutes.': { en: 'Too many attempts. Try again in a few minutes.', ar: 'محاولات كثيرة. أعد المحاولة بعد دقائق.' },
  'Transition invalide': { en: 'Invalid status change', ar: 'تغيير حالة غير صالح' },
  'Utilisateur introuvable': { en: 'User not found', ar: 'المستخدم غير موجود' },
  'Valeur invalide': { en: 'Invalid value', ar: 'قيمة غير صالحة' },
  'Visibilité invalide': { en: 'Invalid visibility', ar: 'ظهور غير صالح' },
  'Erreur': { en: 'Error', ar: 'خطأ' }
};
const SERVER_ERR_PREFIXES = [   // messages dynamiques (préfixe + valeur)
  { k: 'Commande minimum: ', v: { en: 'Minimum order: ', ar: 'الحد الأدنى للطلب: ' } }
];
let CUR_LANG = 'fr';
export function trErr(msg) {   // traduit un message serveur (français) dans la langue actuelle
  if (!msg) return CUR_LANG === 'ar' ? 'خطأ في الخادم — أعد المحاولة' : CUR_LANG === 'en' ? 'Server error — please retry' : 'Erreur serveur — réessaie';
  const e = SERVER_ERRORS[msg];
  if (e) return e[CUR_LANG] || msg;
  for (const p of SERVER_ERR_PREFIXES) if (msg.startsWith(p.k)) return (p.v[CUR_LANG] || p.k) + msg.slice(p.k.length);
  return msg;
}
export async function api(path, opts = {}) {
  const token = localStorage.getItem('yl_token');
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(trErr(data.error));
    if (data.retry_after) err.retryAfter = data.retry_after;   // chronomètre anti brute-force
    throw err;
  }
  return data;
}

// ================= i18n =================
const DICT = {
  fr: {
    v_required: 'obligatoire', v_too_short: 'trop court', v_example: 'exemple',
    v_phone_bad: 'numéro invalide — exemple : 0100 123 4567',
    v_email_bad: 'email invalide — exemple : nom@gmail.com',
    v_price_bad: 'valeur invalide — exemple', v_pass_short: 'Mot de passe trop court (5 caractères minimum)',
    tagline: 'Livraison rapide de tout ce que vous aimez',
    login_title: 'Connexion', login_sub: 'Content de te revoir !', email: 'Email', password: 'Mot de passe',
    btn_login: 'Se connecter', no_account: 'Pas de compte ?', link_register: 'Créer un compte',
    have_account: 'Déjà un compte ?', link_login: 'Se connecter', register_title: 'Créer un compte',
    name: 'Nom complet', phone: 'Téléphone', role_client: 'Client', role_merchant: 'Magasin', role_driver: 'Livreur',
    role_client_desc: 'Commander des produits', role_merchant_desc: 'Vendre mes produits', role_driver_desc: 'Livrer et gagner',
    store_name: 'Nom du magasin', store_type: 'Type de magasin', vehicle: 'Véhicule', btn_register: 'S\u2019inscrire',
    demo_accounts: 'Comptes de démonstration (cliquez pour remplir)', err_invalid: 'Identifiants incorrects',
    pending_driver: 'Votre compte livreur est en attente de validation par l\u2019administrateur',
    pending_store: 'Votre magasin est en attente de validation par l\u2019administrateur',
    type_restaurant: 'Restaurant', type_market: 'Marché', type_pharmacy: 'Pharmacie', type_all: 'Tous',
    type_home: 'Meubles & Électroménager', type_clothes: 'Vêtements', type_electronics: 'Électronique & Accessoires',
    tab_stores: 'Magasins', tab_map: 'Carte', tab_products: 'Produits', open_store: 'Voir le magasin', driver_on_trip: 'En course',
    revenue_lbl: "Chiffre d'affaires", commission_earned: 'Commission perçue', orders_total: 'Commandes', orders_delivered: 'Livrées',
    owner_info: 'Propriétaire', joined: 'Inscrit le', store_details_info: 'Informations', products_list: 'Catalogue', last_orders: 'Dernières commandes',
    open_in_osm: 'Voir sur la carte',
    pending_stores: 'magasin(s) en attente de validation', review_now: 'Examiner maintenant',
    reject_store_q: 'Refuser le magasin', store_rejected: 'Magasin refusé et supprimé', store_suspended: 'Magasin suspendu',
    home_title: 'Bonjour', home: 'Accueil', search_ph: 'Rechercher un magasin...', search_product_ph: 'Rechercher un produit...', clear_search: 'Effacer', open: 'Ouvert', closed: 'Fermé',
    forgot_password: 'Mot de passe oublié ?', reset_title: 'Réinitialiser le mot de passe', reset_desc: 'Entrez votre email — un code à 6 chiffres sera généré (valable 15 minutes).',
    send_code: 'Envoyer le code', code_sent: 'Code envoyé / généré pour', dev_code_note: 'Email non configuré — votre code :',
    reset_code: 'Code (6 chiffres)', new_password: 'Nouveau mot de passe', reset_ok_btn: 'Réinitialiser', reset_ok: 'Mot de passe réinitialisé ✓ — connectez-vous',
    account_settings: 'Paramètres du compte', account_info: 'Mes informations', current_password: 'Mot de passe actuel',
    assign_to: 'Attribuer à…', assign_title: 'Attribuer la livraison', rerouted: 'Nouvel itinéraire calculé depuis votre position',
    driver_busy_confirm: '⚠️ Ce livreur a déjà {n} livraison(s) en cours.\nLui attribuer quand même ?',
    assigned_ok: 'Livraison attribuée ✓', plan_store_first: 'il passera d’abord au magasin', plan_finish_first: 'il finira sa livraison en cours puis passera au magasin',
    driver_free: 'Disponible', no_private_drivers: 'Aucun livreur personnel — créez-en un dans l’onglet Mes livreurs',
    store_photo_lbl: 'Photo du magasin', store_photo_hint: "Logo visible par les clients (à la place de l'emoji) · tout format, compression auto", remove_photo: 'Retirer la photo',
    change_password: 'Changer le mot de passe', password_changed: 'Mot de passe changé ✓', data_saved: 'Enregistré ✓',
    set_password: 'Définir le mot de passe', set_password_q: 'Nouveau mot de passe pour', pass_reset_ok: 'Mot de passe défini ✓',
    reset_requests: 'Demandes de réinitialisation', copy_code: 'Cliquer pour copier', copied: 'Copié ✓',
    reset_requests_note: 'Transmettez le code à l\u2019utilisateur (il peut aussi vous appeler) : il entre email + code + nouveau mot de passe sur la page de connexion.',
    delivery_fee: 'Livraison', products_count: 'produits', added: 'Ajouté au panier', cart: 'Panier',
    cart_empty: 'Votre panier est vide', cart_replace_title: 'Changer de magasin ?',
    cart_replace_msg: 'Votre panier contient des articles d\u2019un autre magasin. Vider le panier et ajouter ce produit ?',
    yes: 'Oui', no: 'Non', clear: 'Vider', subtotal: 'Sous-total', total: 'Total', payment: 'Paiement',
    pay_cash: 'Cash à la livraison', pay_cash_desc: 'Payez le livreur à la réception', pay_card: 'Carte en ligne',
    pay_card_desc: 'Paiement sécurisé immédiat', address: 'Adresse de livraison', note: 'Note (optionnel)',
    place_order: 'Commander', order_placed: 'Commande passée !', my_orders: 'Mes commandes', orders_empty: 'Aucune commande',
    cancel: 'Annuler', cancelled_ok: 'Commande annulée', profile: 'Profil', language: 'Langue', logout: 'Déconnexion',
    min_order_error: 'Commande minimum non atteinte', store_closed: 'Ce magasin est fermé actuellement',
    menu: 'Catalogue', items: 'articles', view_cart: 'Voir le panier',
    st_pending: 'En attente', st_accepted: 'Acceptée', st_preparing: 'En préparation', st_ready: 'Prête',
    st_assigned: 'Livreur en route', st_picked_up: 'Colis récupéré', st_delivered: 'Livrée', st_rejected: 'Refusée', st_cancelled: 'Annulée', st_refused: 'Refused at delivery', st_refused: 'Refusée à la livraison',
    dashboard: 'Tableau de bord', products: 'Produits', store_settings: 'Magasin', new_orders: 'Nouvelles commandes',
    revenue: 'Revenu', today: 'Aujourd\u2019hui', orders: 'Commandes', accept: 'Accepter', reject: 'Refuser',
    start_preparing: 'Préparer', mark_ready: 'Prête', client: 'Client', driver: 'Livreur', add_product: 'Ajouter un produit',
    edit: 'Modifier', save: 'Enregistrer', delete: 'Supprimer', product_name: 'Nom du produit', category: 'Catégorie',
    price: 'Prix', emoji_label: 'Emoji', available: 'Disponible', saved: 'Enregistré ✓', description: 'Description',
    fee_lbl: 'Frais de livraison', min_lbl: 'Commande minimum', open_toggle: 'Magasin ouvert (accepter les commandes)',
    no_orders: 'Aucune commande pour le moment', paid: 'Payé', unpaid: 'À encaisser', card: 'Carte', cash: 'Cash',
    product_deleted: 'Produit supprimé', product_added: 'Produit ajouté ✓', store_saved: 'Magasin mis à jour ✓',
    driver_title: 'Espace Livreur', online: 'En ligne', offline: 'Hors ligne', available_d: 'Livraisons disponibles',
    my_deliveries: 'Mes livraisons', history: 'Historique', accept_d: 'Accepter la livraison', picked_up_btn: 'Colis récupéré',
    delivered_btn: 'Marquer comme livré', pickup: 'Retrait', dropoff: 'Livraison', fee_earned: 'Gain',
    today_earnings: 'Gains aujourd\u2019hui', total_earnings: 'Gains totaux', deliveries_count: 'Livraisons',
    none_available: 'Aucune livraison disponible pour le moment', waiting_validation: 'Compte en attente de validation par l\u2019administrateur',
    call: 'Appeler', accepted_ok: 'Livraison acceptée !', delivered_ok: 'Livraison terminée 🎉',
    sa_dashboard: 'Vue d\u2019ensemble', sa_users: 'Utilisateurs', sa_stores: 'Magasins', sa_orders: 'Commandes', sa_settings: 'Paramètres',
    total_users: 'Utilisateurs', total_stores: 'Magasins', total_drivers: 'Livreurs', total_orders: 'Commandes',
    gmv: 'Chiffre d\u2019affaires', commissions: 'Commissions plateforme', payouts: 'Frais livraison (livreurs)',
    orders_today_c: 'Commandes aujourd\u2019hui', approve: 'Approuver', suspend: 'Suspendre', activate: 'Activer',
    role: 'Rôle', status: 'Statut', active: 'Actif', pending: 'En attente', suspended: 'Suspendu', owner: 'Propriétaire',
    app_name_lbl: 'Nom de l\u2019application', currency_lbl: 'Devise', commission_lbl: 'Commission plateforme (%)',
    save_settings: 'Enregistrer', settings_saved: 'Paramètres enregistrés ✓', all: 'Tous', date: 'Date', actions: 'Actions',
    recent_orders: 'Dernières commandes', no_data: 'Aucune donnée', store: 'Magasin', user_updated: 'Utilisateur mis à jour',
    store_updated: 'Magasin mis à jour', join_us: 'Livreur ? Inscivez-vous !', merchant_hint: 'Ajoutez vos produits et gérez vos commandes',
    approved_stores: 'Magasins actifs', pending_label: 'En attente', welcome_back: 'Bienvenue',
    loading: 'Chargement...', error: 'Erreur', back: 'Retour', order: 'Commande', detail: 'Détail', earnings_note: 'Vous gagnez les frais de livraison de chaque commande livrée',
    rate_order: 'Notez votre commande', rate_store: 'Note du magasin', rate_driver: 'Note du livreur', comment_ph: 'Votre commentaire (optionnel)',
    send: 'Envoyer', thanks_review: 'Merci pour votre avis ⭐', your_review: 'Votre note',
    notif_enable: 'Activer les notifications', notif_on: 'Notifications activées 🔔', notif_off: 'Notifications non disponibles ici',
    new_order: 'Nouvelle commande reçue 🧾', new_delivery: 'Nouvelle livraison disponible 🛵', export_csv: 'Exporter CSV',
    photo_label: 'Photo du produit', upload_photo: 'Choisir une image…', photo_hint: 'Tout format jusqu\u2019à 50 Mo · optimisée automatiquement (charge plus vite)',
    img_err_format: 'Image illisible par le navigateur (HEIC/iPhone ?) — enregistrez-la en JPG ou PNG', img_err_big: 'Image trop volumineuse (plus de 50 Mo)', cgu_link: 'Conditions générales & confidentialité',
    photos_n_added: '{n} photos ajoutées ✓',
    use_gps: 'Utiliser ma position GPS', gps_ok: 'Position GPS enregistrée 📍', gps_fail: 'Position GPS indisponible',
    view_map: 'Suivre sur la carte 🗺️', track_title: 'Suivi en direct',
    card_number: 'Numéro de carte', expiry: 'Expiration (MM/AA)', cvc: 'CVC', processing_pay: 'Paiement en cours…', pay_ok: 'Paiement accepté ✓',
    card_demo: 'Mode démo — aucun débit réel', store_note: 'Note du magasin', driver_note: 'Note moyenne', reviews: 'avis',
    // v3
    chat_empty: 'Aucun message — démarrez la conversation 💬', write_msg: 'Écrivez un message…', you: 'Vous',
    promo_title: 'Code promo', promo_apply: 'Appliquer', promo_ok: 'Code appliqué ✓', promo_remove: 'Retirer', discount: 'Réduction',
    promos: 'Codes promo', new_promo: 'Nouveau code', promo_type_percent: 'Pourcentage (%)', promo_type_fixed: 'Montant fixe',
    promo_min: 'Commande minimum', promo_max: 'Utilisations max (0 = illimité)', uses: 'util.',
    sales14: 'Ventes des 14 derniers jours', gmv14: 'CA plateforme (14 jours)', commission14: 'Commissions (14 jours)',
    orders14: 'Commandes (14 jours)', top_products: 'Meilleurs produits', sold: 'vendus',
    push_on: 'Notifications push activées 🔔', push_fail: 'Activation impossible ici', push_no: 'Autorisation refusée',
    route: 'Trajet', view_route: 'Voir le trajet',
    choose_on_map: 'Choisir sur la carte', pin_hint: 'L\u2019épingle est fixe : déplacez la carte jusqu\u2019à ce que le centre soit exactement votre adresse',
    confirm_location: 'Confirmer cette position', locating: 'Recherche de l\u2019adresse…', address_updated: 'Adresse mise à jour 📍',
    loc_defined: 'Position précise définie', product_details: 'Détail du produit', add_to_cart: 'Ajouter au panier',
    tab_active: 'En cours', tab_new: 'Nouvelles', tab_done: 'Terminées',
    drivers_team: 'Mes livreurs', add_driver: 'Ajouter un livreur', no_drivers: 'Aucun livreur pour le moment — ajoutez votre premier livreur 🛵',
    driver_created: 'Livreur créé ✓', login_note: 'Identifiant à communiquer au livreur :', live_positions: 'Positions en direct',
    deliveries_done: 'livraisons', last_seen: 'Vu', no_pos_yet: 'Pas encore de position', team_note: 'Vos livreurs ne voient que les livraisons de votre magasin — et vous, seulement vos livreurs.',
    store_position: 'Position du magasin', store_driver_badge: 'Boutique',
    ready_private: 'Prête · mes livreurs', ready_public: 'Prête · espace public',
    auto_assign_note: 'Attribution automatique : les livraisons publiques vous sont assignées selon votre position (5 max) — itinéraire recalculé automatiquement',
    alarm_title: 'NOUVELLE LIVRAISON ASSIGNÉE', alarm_ok: 'J\u2019ai compris !', ack_ok: 'Livraison confirmée ✓',
    alarm_hint: 'L\u2019alarme sonne jusqu\u2019à ce que vous appuyiez sur OK. Votre itinéraire a été mis à jour.',
    tour_title: 'Itinéraire optimisé', tour_pickup: 'À récupérer', tour_deliver: 'À livrer', pub_private: 'Mes livreurs', pub_public: 'Espace public',
    general_drivers: 'Livreurs généraux', create_gdriver: 'Créer un livreur général', gdriver_created: 'Livreur général créé ✓',
    gdriver_badge: 'Général', gdriver_note: 'Ces livreurs sont créés par vous seul et voient uniquement les livraisons publiées dans l\u2019espace public. Les boutiques ne voient leurs coordonnées que s\u2019ils prennent une livraison chez elles.',
    main_photo: 'Photo principale', more_photos: 'Autres photos', gallery_hint: 'Le client les verra dans la fiche produit',
    max_photos: 'Maximum 5 photos par produit', save_first_photos: 'Enregistrez d\u2019abord le produit pour ajouter des photos', gallery_pending_hint: 'Ajoutées automatiquement à l\u2019enregistrement du produit', photo_added: 'Photo ajoutée ✓', photo_removed: 'Photo supprimée', driver_suspended_ok: 'Livreur suspendu', driver_delete_q: 'Supprimer ce livreur ?',
    retry_in: 'Trop de tentatives — réessayez dans', offline_route: 'ligne directe (itinéraire routier indisponible hors ligne)',
    address_ph: 'Rue, quartier, étage...', guest_order_title: 'Créez votre compte pour finaliser',
    partner_title: 'Devenir partenaire', partner_desc: 'Ouvrez votre magasin sur YallaLiv : vos produits, vos livraisons, vos clients.',
    partner_submit: 'Envoyer ma demande', partner_hint: '🏪 Vous avez un magasin ? Créez votre compte puis devenez partenaire depuis votre profil.',
    my_spaces: 'Mes espaces', switch_store: 'Espace magasin', switch_client: 'Espace client', switch_admin: 'Espace administration',
    email_or_phone: 'Email ou téléphone', via_email: 'Avec email', via_phone: 'Avec téléphone',
    phone_no_email_note: 'Sans email, la récupération du mot de passe se fera via le support YallaLiv.',
    or_continue: 'ou continuer avec', verify_email_title: 'Vérifiez votre email',
    confirm_password: 'Confirmer le mot de passe', password_mismatch: 'Les mots de passe ne correspondent pas',
    confirm_order_title: 'Confirmez votre commande',
    confirm_phone_msg: 'Votre livreur vous appellera sur ce numéro pour la livraison. Vous pouvez le modifier avant de confirmer.',
    confirm_order_btn: 'Confirmer et commander',
    code_sent_to: 'Un code à 6 chiffres a été envoyé à', verify_create_btn: 'Vérifier et créer mon compte', resend_code: 'Renvoyer le code',
    phone_needed_note: 'Votre numéro de téléphone est obligatoire pour la livraison', partner_missing_note: 'Complétez toutes les informations pour envoyer votre demande',
    guest_order_desc: 'Vos informations créent votre compte — vous suivrez votre livraison en direct.', login_orders_cta: 'Connectez-vous pour retrouver vos commandes',
    login_profile_cta: 'Connectez-vous à votre compte'
  },
  ar: {
    v_required: 'مطلوب', v_too_short: 'قصير جداً', v_example: 'مثال',
    v_phone_bad: 'رقم غير صالح — مثال: 0100 123 4567',
    v_email_bad: 'بريد غير صالح — مثال: nom@gmail.com',
    v_price_bad: 'قيمة غير صالحة — مثال', v_pass_short: 'كلمة المرور قصيرة (5 أحرف على الأقل)',
    tagline: 'توصيل سريع لكل ما تحب',
    login_title: 'تسجيل الدخول', login_sub: 'أهلاً بعودتك!', email: 'البريد الإلكتروني', password: 'كلمة المرور',
    btn_login: 'دخول', no_account: 'ليس لديك حساب؟', link_register: 'إنشاء حساب',
    have_account: 'لديك حساب؟', link_login: 'دخول', register_title: 'إنشاء حساب',
    name: 'الاسم الكامل', phone: 'الهاتف', role_client: 'عميل', role_merchant: 'متجر', role_driver: 'سائق توصيل',
    role_client_desc: 'اطلب المنتجات', role_merchant_desc: 'بِع منتجاتك', role_driver_desc: 'وصّل واربح',
    store_name: 'اسم المتجر', store_type: 'نوع المتجر', vehicle: 'المركبة', btn_register: 'تسجيل',
    demo_accounts: 'حسابات تجريبية (اضغط للتعبئة)', err_invalid: 'بيانات الدخول غير صحيحة',
    pending_driver: 'حسابك في انتظار موافقة الإدارة',
    pending_store: 'متجرك في انتظار موافقة الإدارة',
    type_restaurant: 'مطعم', type_market: 'سوبرماركت', type_pharmacy: 'صيدلية', type_all: 'الكل',
    type_home: 'أثاث وأجهزة منزلية', type_clothes: 'ملابس', type_electronics: 'إلكترونيات وملحقاتها',
    tab_stores: 'المتاجر', tab_map: 'الخريطة', tab_products: 'المنتجات', open_store: 'افتح المتجر', driver_on_trip: 'في توصيلة',
    revenue_lbl: 'إجمالي المبيعات', commission_earned: 'العمولة المحصلة', orders_total: 'الطلبات', orders_delivered: 'تم تسليمها',
    owner_info: 'المالك', joined: 'مسجل منذ', store_details_info: 'معلومات', products_list: 'قائمة المنتجات', last_orders: 'آخر الطلبات',
    open_in_osm: 'عرض على الخريطة',
    pending_stores: 'متجر بانتظار الموافقة', review_now: 'راجع الآن',
    reject_store_q: 'رفض المتجر', store_rejected: 'تم رفض المتجر وحذفه', store_suspended: 'تم إيقاف المتجر',
    home_title: 'أهلاً', home: 'الرئيسية', search_ph: 'ابحث عن متجر...', search_product_ph: 'ابحث عن منتج...', clear_search: 'مسح', open: 'مفتوح', closed: 'مغلق',
    forgot_password: 'نسيت كلمة المرور؟', reset_title: 'إعادة تعيين كلمة المرور', reset_desc: 'أدخل بريدك الإلكتروني — سيتم إنشاء رمز من 6 أرقام (صالح 15 دقيقة).',
    send_code: 'إرسال الرمز', code_sent: 'تم إرسال / إنشاء رمز لـ', dev_code_note: 'البريد غير مهيأ — رمزك:',
    reset_code: 'الرمز (6 أرقام)', new_password: 'كلمة مرور جديدة', reset_ok_btn: 'إعادة التعيين', reset_ok: 'تمت إعادة التعيين ✓ — سجّل الدخول',
    account_settings: 'إعدادات الحساب', account_info: 'بياناتي', current_password: 'كلمة المرور الحالية',
    assign_to: 'إسناد إلى…', assign_title: 'إسناد التوصيلة', rerouted: 'تم حساب مسار جديد من موقعك الحالي',
    driver_busy_confirm: '⚠️ لدى هذا السائق {n} توصيلة قيد التنفيذ.\nإسنادها له على أي حال؟',
    assigned_ok: 'تمت الإسناد ✓', plan_store_first: 'سيمر أولاً على المتجر', plan_finish_first: 'سينهي توصيلته الحالية ثم يمر بالمتجر',
    driver_free: 'متاح', no_private_drivers: 'لا يوجد سائق شخصي — أنشئ واحداً من تبويب سائقوّي',
    store_photo_lbl: 'صورة المتجر', store_photo_hint: 'أي صيغة حتى 50 ميجابايت · يتم تحسينها تلقائياً (تحميل أسرع)', remove_photo: 'إزالة الصورة',
    change_password: 'تغيير كلمة المرور', password_changed: 'تم تغيير كلمة المرور ✓', data_saved: 'تم الحفظ ✓',
    set_password: 'تعيين كلمة المرور', set_password_q: 'كلمة مرور جديدة لـ', pass_reset_ok: 'تم تعيين كلمة المرور ✓',
    reset_requests: 'طلبات إعادة التعيين', copy_code: 'انقر للنسخ', copied: 'تم النسخ ✓',
    reset_requests_note: 'أبلغ الرمز للمستخدم (يمكنه الاتصال بك أيضاً): يدخل البريد + الرمز + كلمة مرور جديدة في صفحة الدخول.',
    delivery_fee: 'التوصيل', products_count: 'منتجات', added: 'أُضيف إلى السلة', cart: 'السلة',
    cart_empty: 'سلتك فارغة', cart_replace_title: 'تغيير المتجر؟',
    cart_replace_msg: 'سلتك تحتوي على منتجات من متجر آخر. هل تريد إفراغها وإضافة هذا المنتج؟',
    yes: 'نعم', no: 'لا', clear: 'إفراغ', subtotal: 'المجموع الفرعي', total: 'الإجمالي', payment: 'الدفع',
    pay_cash: 'الدفع عند الاستلام', pay_cash_desc: 'ادفع للسائق عند الاستلام', pay_card: 'بطاقة عبر الإنترنت',
    pay_card_desc: 'دفع آمن فوري', address: 'عنوان التوصيل', note: 'ملاحظة (اختياري)',
    place_order: 'اطلب الآن', order_placed: 'تم إرسال الطلب!', my_orders: 'طلباتي', orders_empty: 'لا توجد طلبات',
    cancel: 'إلغاء', cancelled_ok: 'تم إلغاء الطلب', profile: 'الملف الشخصي', language: 'اللغة', logout: 'تسجيل الخروج',
    min_order_error: 'لم يصل بعد الحد الأدنى للطلب', store_closed: 'هذا المتجر مغلق حالياً',
    menu: 'المنتجات', items: 'منتجات', view_cart: 'عرض السلة',
    st_pending: 'قيد الانتظار', st_accepted: 'مقبول', st_preparing: 'قيد التحضير', st_ready: 'جاهز',
    st_assigned: 'السائق في الطريق', st_picked_up: 'تم استلام الطلب', st_delivered: 'تم التوصيل', st_rejected: 'مرفوض', st_cancelled: 'ملغي', st_refused: 'مرفوضة عند التسليم',
    dashboard: 'لوحة التحكم', products: 'المنتجات', store_settings: 'المتجر', new_orders: 'طلبات جديدة',
    revenue: 'الإيرادات', today: 'اليوم', orders: 'الطلبات', accept: 'قبول', reject: 'رفض',
    start_preparing: 'تحضير', mark_ready: 'جاهز', client: 'العميل', driver: 'السائق', add_product: 'إضافة منتج',
    edit: 'تعديل', save: 'حفظ', delete: 'حذف', product_name: 'اسم المنتج', category: 'الفئة',
    price: 'السعر', emoji_label: 'إيموجي', available: 'متوفر', saved: 'تم الحفظ ✓', description: 'الوصف',
    fee_lbl: 'رسوم التوصيل', min_lbl: 'الحد الأدنى للطلب', open_toggle: 'المتجر مفتوح (استقبال الطلبات)',
    no_orders: 'لا توجد طلبات حالياً', paid: 'مدفوع', unpaid: 'غير محصّل', card: 'بطاقة', cash: 'نقداً',
    product_deleted: 'تم حذف المنتج', product_added: 'تمت إضافة المنتج ✓', store_saved: 'تم تحديث المتجر ✓',
    driver_title: 'فضاء السائق', online: 'متصل', offline: 'غير متصل', available_d: 'توصيلات متاحة',
    my_deliveries: 'توصيلاتي', history: 'السجل', accept_d: 'قبول التوصيل', picked_up_btn: 'تم استلام الطلب',
    delivered_btn: 'تم التوصيل', pickup: 'الاستلام', dropoff: 'التسليم', fee_earned: 'الربح',
    today_earnings: 'أرباح اليوم', total_earnings: 'إجمالي الأرباح', deliveries_count: 'التوصيلات',
    none_available: 'لا توجد توصيلات متاحة حالياً', waiting_validation: 'حسابك بانتظار موافقة الإدارة',
    call: 'اتصال', accepted_ok: 'تم قبول التوصيل!', delivered_ok: 'تم التوصيل 🎉',
    sa_dashboard: 'نظرة عامة', sa_users: 'المستخدمون', sa_stores: 'المتاجر', sa_orders: 'الطلبات', sa_settings: 'الإعدادات',
    total_users: 'المستخدمون', total_stores: 'المتاجر', total_drivers: 'السائقون', total_orders: 'الطلبات',
    gmv: 'إجمالي المبيعات', commissions: 'عمولات المنصة', payouts: 'رسوم التوصيل (السائقون)',
    orders_today_c: 'طلبات اليوم', approve: 'موافقة', suspend: 'إيقاف', activate: 'تنشيط',
    role: 'الدور', status: 'الحالة', active: 'نشط', pending: 'انتظار', suspended: 'موقوف', owner: 'المالك',
    app_name_lbl: 'اسم التطبيق', currency_lbl: 'العملة', commission_lbl: 'عمولة المنصة (%)',
    save_settings: 'حفظ', settings_saved: 'تم حفظ الإعدادات ✓', all: 'الكل', date: 'التاريخ', actions: 'إجراءات',
    recent_orders: 'أحدث الطلبات', no_data: 'لا توجد بيانات', store: 'المتجر', user_updated: 'تم تحديث المستخدم',
    store_updated: 'تم تحديث المتجر', join_us: 'سائق توصيل؟ سجّل الآن!', merchant_hint: 'أضف منتجاتك وأدر طلباتك',
    approved_stores: 'متاجر نشطة', pending_label: 'قيد الانتظار', welcome_back: 'مرحباً',
    loading: 'جارٍ التحميل...', error: 'خطأ', back: 'رجوع', order: 'طلب', detail: 'تفاصيل', earnings_note: 'تكسب رسوم توصيل كل طلب توصله',
    rate_order: 'قيّم طلبك', rate_store: 'تقييم المتجر', rate_driver: 'تقييم السائق', comment_ph: 'تعليقك (اختياري)',
    send: 'إرسال', thanks_review: 'شكراً لتقييمك ⭐', your_review: 'تقييمك',
    notif_enable: 'تفعيل الإشعارات', notif_on: 'تم تفعيل الإشعارات 🔔', notif_off: 'الإشعارات غير متاحة هنا',
    new_order: 'طلب جديد 🧾', new_delivery: 'توصيل جديد متاح 🛵', export_csv: 'تصدير CSV',
    photo_label: 'صورة المنتج', upload_photo: 'اختر صورة…', photo_hint: 'أي صيغة · الجودة الأصلية محفوظة (حتى 50 ميجا)',
    img_err_format: 'صورة غير مقروءة في المتصفح (HEIC/آيفون؟) — احفظها بصيغة JPG أو PNG', img_err_big: 'الصورة كبيرة جداً (أكثر من 50 ميجا)', cgu_link: 'الشروط العامة وسياسة الخصوصية',
    photos_n_added: 'تمت إضافة {n} صور ✓',
    use_gps: 'استخدم موقعي GPS', gps_ok: 'تم تحديد موقعك 📍', gps_fail: 'تعذر تحديد الموقع',
    view_map: 'تتبع على الخريطة 🗺️', track_title: 'تتبع مباشر',
    card_number: 'رقم البطاقة', expiry: 'الانتهاء (MM/YY)', cvc: 'رمز التحقق', processing_pay: 'جارٍ الدفع…', pay_ok: 'تم الدفع ✓',
    card_demo: 'وضع تجريبي — لا خصم حقيقي', store_note: 'تقييم المتجر', driver_note: 'متوسط التقييم', reviews: 'تقييم',
    // v3
    chat_empty: 'لا توجد رسائل — ابدأ المحادثة 💬', write_msg: 'اكتب رسالة…', you: 'أنت',
    promo_title: 'كود خصم', promo_apply: 'تطبيق', promo_ok: 'تم تطبيق الكود ✓', promo_remove: 'إزالة', discount: 'الخصم',
    promos: 'أكواد الخصم', new_promo: 'كود جديد', promo_type_percent: 'نسبة (%)', promo_type_fixed: 'مبلغ ثابت',
    promo_min: 'الحد الأدنى للطلب', promo_max: 'أقصى استخدام (0 = بلا حد)', uses: 'استخدام',
    sales14: 'مبيعات آخر 14 يوماً', gmv14: 'إيرادات المنصة (14 يوماً)', commission14: 'العمولات (14 يوماً)',
    orders14: 'الطلبات (14 يوماً)', top_products: 'المنتجات الأكثر مبيعاً', sold: 'مبيع',
    push_on: 'تم تفعيل الإشعارات 🔔', push_fail: 'تعذر التفعيل هنا', push_no: 'تم رفض الإذن',
    route: 'المسار', view_route: 'عرض المسار',
    choose_on_map: 'اختر على الخريطة', pin_hint: 'الدبوس ثابت: حرّك الخريطة حتى يصبح المركز هو عنوانك بالضبط',
    confirm_location: 'تأكيد هذا الموقع', locating: 'جارٍ البحث عن العنوان…', address_updated: 'تم تحديث العنوان 📍',
    loc_defined: 'تم تحديد الموقع بدقة', product_details: 'تفاصيل المنتج', add_to_cart: 'أضف إلى السلة',
    tab_active: 'جارية', tab_new: 'جديدة', tab_done: 'منتهية',
    drivers_team: 'سائقوّي', add_driver: 'إضافة سائق', no_drivers: 'لا يوجد سائقون — أضف أول سائق 🛵',
    driver_created: 'تم إنشاء السائق ✓', login_note: 'المعرف الذي يجب إبلاغه للسائق:', live_positions: 'المواقع المباشرة',
    deliveries_done: 'توصيل', last_seen: 'آخر ظهور', no_pos_yet: 'لا يوجد موقع بعد', team_note: 'سائقوك يرون طلبات متجرك فقط — وأنت ترى سائقيك فقط.',
    store_position: 'موقع المتجر', store_driver_badge: 'المتجر',
    ready_private: 'جاهز · سائقوّي', ready_public: 'جاهز · الفضاء العام',
    auto_assign_note: 'الإسناد التلقائي: تُسند إليك الطلبات العامة حسب موقعك (5 كحد أقصى) — ويُعاد حساب المسار تلقائياً',
    alarm_title: 'توصيلة جديدة أُسندت إليك', alarm_ok: 'فهمت!', ack_ok: 'تم تأكيد التوصيلة ✓',
    alarm_hint: 'سيستمر التنبيه حتى تضغط موافق. تم تحديث مسارك.',
    tour_title: 'المسار الأمثل', tour_pickup: 'للاستلام', tour_deliver: 'للتسليم', pub_private: 'سائقوّي', pub_public: 'الفضاء العام',
    general_drivers: 'السائقون العامون', create_gdriver: 'إنشاء سائق عام', gdriver_created: 'تم إنشاء السائق العام ✓',
    gdriver_badge: 'عام', gdriver_note: 'هؤلاء السائقون ينشئهم المدير العام وحده، ويرون الطلبات المنشورة في الفضاء العام فقط. المتاجر لا ترى بياناتهم إلا إذا أخذوا توصيلة منها.',
    main_photo: 'الصورة الرئيسية', more_photos: 'صور أخرى', gallery_hint: 'سيراها العميل في صفحة المنتج',
    max_photos: 'بحد أقصى 5 صور لكل منتج', save_first_photos: 'احفظ المنتج أولاً ثم أضف الصور', gallery_pending_hint: 'ستُضاف تلقائياً عند حفظ المنتج', photo_added: 'تمت إضافة الصورة ✓', photo_removed: 'تم حذف الصورة', driver_suspended_ok: 'تم إيقاف السائق', driver_delete_q: 'حذف هذا السائق؟',
    retry_in: 'محاولات كثيرة — أعد المحاولة خلال', offline_route: 'خط مباشر (المسار الطرقي غير متاح دون اتصال)',
    address_ph: 'الشارع، الحي، الطابق...', guest_order_title: 'أنشئ حسابك لإتمام الطلب',
    partner_title: 'كن شريكاً', partner_desc: 'افتح متجرك على يلا ليف: منتجاتك، توصيلاتك، عملاؤك.',
    partner_submit: 'إرسال طلبي', partner_hint: '🏪 لديك متجر؟ أنشئ حسابك ثم كن شريكاً من صفحة حسابك.',
    my_spaces: 'مساحاتي', switch_store: 'مساحة المتجر', switch_client: 'مساحة العميل', switch_admin: 'مساحة الإدارة',
    email_or_phone: 'البريد الإلكتروني أو الهاتف', via_email: 'بالبريد الإلكتروني', via_phone: 'بالهاتف',
    phone_no_email_note: 'بدون بريد إلكتروني، ستتم استعادة كلمة المرور عبر دعم يلا ليف.',
    or_continue: 'أو المتابعة باستخدام', verify_email_title: 'تحقق من بريدك الإلكتروني',
    confirm_password: 'تأكيد كلمة المرور', password_mismatch: 'كلمتا المرور غير متطابقتين',
    confirm_order_title: 'أكّد طلبك',
    confirm_phone_msg: 'سيتصل بك المندوب على هذا الرقم للتوصيل. يمكنك تعديله قبل التأكيد.',
    confirm_order_btn: 'تأكيد وطلب',
    code_sent_to: 'تم إرسال رمز من 6 أرقام إلى', verify_create_btn: 'تحقق وأنشئ حسابي', resend_code: 'إعادة إرسال الرمز',
    phone_needed_note: 'رقم هاتفك مطلوب لإتمام التوصيل', partner_missing_note: 'أكمل جميع المعلومات لإرسال طلبك',
    guest_order_desc: 'بياناتك تُنشئ حسابك — وتتابع توصيلتك مباشرة.', login_orders_cta: 'سجّل الدخول لعرض طلباتك',
    login_profile_cta: 'سجّل الدخول إلى حسابك'
  },
  en: {
    v_required: 'required', v_too_short: 'too short', v_example: 'example',
    v_phone_bad: 'invalid number — example: 0100 123 4567',
    v_email_bad: 'invalid email — example: nom@gmail.com',
    v_price_bad: 'invalid value — example', v_pass_short: 'Password too short (5 characters minimum)',
    tagline: 'Fast delivery of everything you love',
    login_title: 'Sign in', login_sub: 'Welcome back!', email: 'Email', password: 'Password',
    btn_login: 'Sign in', no_account: 'No account yet?', link_register: 'Create an account',
    have_account: 'Already have an account?', link_login: 'Sign in', register_title: 'Create an account',
    name: 'Full name', phone: 'Phone', role_client: 'Customer', role_merchant: 'Store', role_driver: 'Driver',
    role_client_desc: 'Order products', role_merchant_desc: 'Sell my products', role_driver_desc: 'Deliver and earn',
    store_name: 'Store name', store_type: 'Store type', vehicle: 'Vehicle', btn_register: 'Sign up',
    demo_accounts: 'Demo accounts (click to fill)', err_invalid: 'Incorrect credentials',
    pending_driver: 'Your driver account is pending approval by the administrator',
    pending_store: 'Your store is pending approval by the administrator',
    type_restaurant: 'Restaurant', type_market: 'Market', type_pharmacy: 'Pharmacy', type_all: 'All',
    type_home: 'Furniture & Appliances', type_clothes: 'Clothes', type_electronics: 'Electronics & Accessories',
    tab_stores: 'Stores', tab_map: 'Map', tab_products: 'Products', open_store: 'View store', driver_on_trip: 'On delivery',
    revenue_lbl: 'Revenue', commission_earned: 'Commission earned', orders_total: 'Orders', orders_delivered: 'Delivered',
    owner_info: 'Owner', joined: 'Joined', store_details_info: 'Information', products_list: 'Catalog', last_orders: 'Recent orders',
    open_in_osm: 'See on the map',
    pending_stores: 'store(s) awaiting approval', review_now: 'Review now',
    reject_store_q: 'Reject store', store_rejected: 'Store rejected and deleted', store_suspended: 'Store suspended',
    home_title: 'Hello', home: 'Home', search_ph: 'Search a store...', search_product_ph: 'Search a product...', clear_search: 'Clear', open: 'Open', closed: 'Closed',
    forgot_password: 'Forgot password?', reset_title: 'Reset password', reset_desc: 'Enter your email — a 6-digit code will be generated (valid for 15 minutes).',
    send_code: 'Send code', code_sent: 'Code sent / generated for', dev_code_note: 'Email not configured — your code:',
    reset_code: 'Code (6 digits)', new_password: 'New password', reset_ok_btn: 'Reset', reset_ok: 'Password reset ✓ — sign in',
    account_settings: 'Account settings', account_info: 'My information', current_password: 'Current password',
    assign_to: 'Assign to…', assign_title: 'Assign delivery', rerouted: 'New route calculated from your current position',
    driver_busy_confirm: '⚠️ This driver already has {n} delivery(ies) in progress.\nAssign anyway?',
    assigned_ok: 'Delivery assigned ✓', plan_store_first: 'he will stop by the store first', plan_finish_first: 'he will finish his current delivery, then stop by the store',
    driver_free: 'Available', no_private_drivers: 'No personal driver — create one in the My drivers tab',
    store_photo_lbl: 'Store photo', store_photo_hint: 'Logo shown to customers (instead of the emoji) · any format, auto-compressed', remove_photo: 'Remove photo',
    change_password: 'Change password', password_changed: 'Password changed ✓', data_saved: 'Saved ✓',
    set_password: 'Set password', set_password_q: 'New password for', pass_reset_ok: 'Password set ✓',
    reset_requests: 'Reset requests', copy_code: 'Click to copy', copied: 'Copied ✓',
    reset_requests_note: 'Give the code to the user (they can also call you): they enter email + code + new password on the sign-in page.',
    delivery_fee: 'Delivery', products_count: 'products', added: 'Added to cart', cart: 'Cart',
    cart_empty: 'Your cart is empty', cart_replace_title: 'Change store?',
    cart_replace_msg: 'Your cart contains items from another store. Clear the cart and add this product?',
    yes: 'Yes', no: 'No', clear: 'Clear', subtotal: 'Subtotal', total: 'Total', payment: 'Payment',
    pay_cash: 'Cash on delivery', pay_cash_desc: 'Pay the driver on arrival', pay_card: 'Card online',
    pay_card_desc: 'Instant secure payment', address: 'Delivery address', note: 'Note (optional)',
    place_order: 'Place order', order_placed: 'Order placed!', my_orders: 'My orders', orders_empty: 'No orders',
    cancel: 'Cancel', cancelled_ok: 'Order cancelled', profile: 'Profile', language: 'Language', logout: 'Log out',
    min_order_error: 'Minimum order not reached', store_closed: 'This store is currently closed',
    menu: 'Catalog', items: 'items', view_cart: 'View cart',
    st_pending: 'Pending', st_accepted: 'Accepted', st_preparing: 'Preparing', st_ready: 'Ready',
    st_assigned: 'Driver on the way', st_picked_up: 'Picked up', st_delivered: 'Delivered', st_rejected: 'Rejected', st_cancelled: 'Cancelled',
    dashboard: 'Dashboard', products: 'Products', store_settings: 'Store', new_orders: 'New orders',
    revenue: 'Revenue', today: 'Today', orders: 'Orders', accept: 'Accept', reject: 'Reject',
    start_preparing: 'Prepare', mark_ready: 'Ready', client: 'Customer', driver: 'Driver', add_product: 'Add product',
    edit: 'Edit', save: 'Save', delete: 'Delete', product_name: 'Product name', category: 'Category',
    price: 'Price', emoji_label: 'Emoji', available: 'Available', saved: 'Saved ✓', description: 'Description',
    fee_lbl: 'Delivery fee', min_lbl: 'Minimum order', open_toggle: 'Store open (accept orders)',
    no_orders: 'No orders yet', paid: 'Paid', unpaid: 'To collect', card: 'Card', cash: 'Cash',
    product_deleted: 'Product deleted', product_added: 'Product added ✓', store_saved: 'Store updated ✓',
    driver_title: 'Driver space', online: 'Online', offline: 'Offline', available_d: 'Available deliveries',
    my_deliveries: 'My deliveries', history: 'History', accept_d: 'Accept delivery', picked_up_btn: 'Picked up',
    delivered_btn: 'Mark as delivered', pickup: 'Pickup', dropoff: 'Drop-off', fee_earned: 'Earnings',
    today_earnings: 'Today’s earnings', total_earnings: 'Total earnings', deliveries_count: 'Deliveries',
    none_available: 'No deliveries available right now', waiting_validation: 'Account pending approval by the administrator',
    call: 'Call', accepted_ok: 'Delivery accepted!', delivered_ok: 'Delivery completed 🎉',
    sa_dashboard: 'Overview', sa_users: 'Users', sa_stores: 'Stores', sa_orders: 'Orders', sa_settings: 'Settings',
    total_users: 'Users', total_stores: 'Stores', total_drivers: 'Drivers', total_orders: 'Orders',
    gmv: 'Revenue', commissions: 'Platform commissions', payouts: 'Delivery fees (drivers)',
    orders_today_c: 'Orders today', approve: 'Approve', suspend: 'Suspend', activate: 'Activate',
    role: 'Role', status: 'Status', active: 'Active', pending: 'Pending', suspended: 'Suspended', owner: 'Owner',
    app_name_lbl: 'App name', currency_lbl: 'Currency', commission_lbl: 'Platform commission (%)',
    save_settings: 'Save', settings_saved: 'Settings saved ✓', all: 'All', date: 'Date', actions: 'Actions',
    recent_orders: 'Recent orders', no_data: 'No data', store: 'Store', user_updated: 'User updated',
    store_updated: 'Store updated', join_us: 'Driver? Sign up!', merchant_hint: 'Add your products and manage your orders',
    approved_stores: 'Active stores', pending_label: 'Pending', welcome_back: 'Welcome',
    loading: 'Loading...', error: 'Error', back: 'Back', order: 'Order', detail: 'Detail', earnings_note: 'You earn the delivery fee of every completed order',
    rate_order: 'Rate your order', rate_store: 'Store rating', rate_driver: 'Driver rating', comment_ph: 'Your comment (optional)',
    send: 'Send', thanks_review: 'Thanks for your review ⭐', your_review: 'Your rating',
    notif_enable: 'Enable notifications', notif_on: 'Notifications enabled 🔔', notif_off: 'Notifications unavailable here',
    new_order: 'New order received 🧾', new_delivery: 'New delivery available 🛵', export_csv: 'Export CSV',
    photo_label: 'Product photo', upload_photo: 'Choose an image…', photo_hint: 'Any format up to 50 MB · optimized automatically (loads faster)',
    img_err_format: 'Image unreadable by the browser (HEIC/iPhone?) — save it as JPG or PNG', img_err_big: 'Image too large (over 50 MB)', cgu_link: 'Terms & privacy policy',
    photos_n_added: '{n} photos added ✓',
    use_gps: 'Use my GPS position', gps_ok: 'GPS position saved 📍', gps_fail: 'GPS position unavailable',
    view_map: 'Track on the map 🗺️', track_title: 'Live tracking',
    card_number: 'Card number', expiry: 'Expiry (MM/YY)', cvc: 'CVC', processing_pay: 'Payment in progress…', pay_ok: 'Payment accepted ✓',
    card_demo: 'Demo mode — no real charge', store_note: 'Store rating', driver_note: 'Average rating', reviews: 'reviews',
    chat_empty: 'No messages yet — start the conversation 💬', write_msg: 'Write a message…', you: 'You',
    promo_title: 'Promo code', promo_apply: 'Apply', promo_ok: 'Code applied ✓', promo_remove: 'Remove', discount: 'Discount',
    promos: 'Promo codes', new_promo: 'New code', promo_type_percent: 'Percentage (%)', promo_type_fixed: 'Fixed amount',
    promo_min: 'Minimum order', promo_max: 'Max uses (0 = unlimited)', uses: 'uses',
    sales14: 'Sales — last 14 days', gmv14: 'Platform revenue (14 days)', commission14: 'Commissions (14 days)',
    orders14: 'Orders (14 days)', top_products: 'Top products', sold: 'sold',
    push_on: 'Push notifications enabled 🔔', push_fail: 'Cannot enable here', push_no: 'Permission denied',
    route: 'Route', view_route: 'View route',
    choose_on_map: 'Choose on the map', pin_hint: 'The pin is fixed: move the map until the center is exactly your address',
    confirm_location: 'Confirm this position', locating: 'Locating address…', address_updated: 'Address updated 📍',
    loc_defined: 'Precise position set', product_details: 'Product details', add_to_cart: 'Add to cart',
    tab_active: 'Active', tab_new: 'New', tab_done: 'Done',
    drivers_team: 'My drivers', add_driver: 'Add driver', no_drivers: 'No drivers yet — add your first driver 🛵',
    driver_created: 'Driver created ✓', login_note: 'Login to give to the driver:', live_positions: 'Live positions',
    deliveries_done: 'deliveries', last_seen: 'Seen', no_pos_yet: 'No position yet', team_note: 'Your drivers only see your store’s deliveries — and you, only your drivers.',
    store_position: 'Store position', store_driver_badge: 'Store',
    ready_private: 'Ready · my drivers', ready_public: 'Ready · public space',
    auto_assign_note: 'Automatic dispatch: public deliveries are assigned to you based on your position (max 5) — route recalculated automatically',
    alarm_title: 'NEW DELIVERY ASSIGNED', alarm_ok: 'Got it!', ack_ok: 'Delivery confirmed ✓',
    alarm_hint: 'The alarm rings until you press OK. Your route has been updated.',
    tour_title: 'Optimized route', tour_pickup: 'To pick up', tour_deliver: 'To deliver', pub_private: 'My drivers', pub_public: 'Public space',
    general_drivers: 'General drivers', create_gdriver: 'Create general driver', gdriver_created: 'General driver created ✓',
    gdriver_badge: 'General', gdriver_note: 'These drivers are created by you only and see only deliveries published in the public space. Stores see their contact details only if they pick up one of their deliveries.',
    main_photo: 'Main photo', more_photos: 'More photos', gallery_hint: 'Customers will see them on the product page',
    max_photos: 'Maximum 5 photos per product', save_first_photos: 'Save the product first to add photos', gallery_pending_hint: 'Added automatically when you save the product', photo_added: 'Photo added ✓', photo_removed: 'Photo removed', driver_suspended_ok: 'Driver suspended', driver_delete_q: 'Delete this driver?',
    retry_in: 'Too many attempts — retry in', offline_route: 'direct line (road route unavailable offline)',
    address_ph: 'Street, area, floor...', guest_order_title: 'Create your account to finish',
    partner_title: 'Become a partner', partner_desc: 'Open your store on YallaLiv: your products, your deliveries, your customers.',
    partner_submit: 'Submit my application', partner_hint: '🏪 Own a store? Create your account, then become a partner from your profile.',
    my_spaces: 'My spaces', switch_store: 'Store space', switch_client: 'Customer space', switch_admin: 'Admin space',
    email_or_phone: 'Email or phone', via_email: 'With email', via_phone: 'With phone',
    phone_no_email_note: 'Without an email, password recovery will go through YallaLiv support.',
    or_continue: 'or continue with', verify_email_title: 'Verify your email',
    confirm_password: 'Confirm password', password_mismatch: 'Passwords do not match',
    confirm_order_title: 'Confirm your order',
    confirm_phone_msg: 'Your driver will call you on this number for the delivery. You can change it before confirming.',
    confirm_order_btn: 'Confirm and order',
    code_sent_to: 'A 6-digit code was sent to', verify_create_btn: 'Verify and create my account', resend_code: 'Resend code',
    phone_needed_note: 'Your phone number is required for delivery', partner_missing_note: 'Complete all the information to submit your application',
    guest_order_desc: 'Your details create your account — you will track your delivery live.', login_orders_cta: 'Sign in to see your orders',
    login_profile_cta: 'Sign in to your account'
  }
};

const LangCtx = createContext(null);
export function LangProvider({ children }) {
  // Langue enregistrée > langue du système (téléphone/PC) > anglais
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem('yl_lang');
    if (saved) return saved;
    const n = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    const l = String(n).slice(0, 2).toLowerCase();
    return ['fr', 'ar', 'en'].includes(l) ? l : 'en';
  });
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    localStorage.setItem('yl_lang', lang);
    CUR_LANG = lang;
  }, [lang]);
  const t = (k) => (DICT[lang] && DICT[lang][k]) || DICT.fr[k] || k;
  return <LangCtx.Provider value={{ lang, setLang: setLangState, t }}>{children}</LangCtx.Provider>;
}
export const useLang = () => useContext(LangCtx);
export const useT = () => useContext(LangCtx).t;
export const fmtDate = (ts, lang) => new Date(ts).toLocaleString(lang === 'ar' ? 'ar-EG-u-nu-latn' : lang === 'en' ? 'en-GB' : 'fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

// ================= Settings (currency, app name) =================
const SYM = { EGP: 'ج.م', EUR: '€', USD: '$', MAD: 'د.م', DZD: 'د.ج', TND: 'د.ت', XOF: 'CFA', SAR: 'ر.س', AED: 'د.إ' };
let CUR = 'EGP';
export function fmtMoney(n) { return (Math.round(n * 100) / 100).toFixed(2) + ' ' + (SYM[CUR] || CUR); }

const SetCtx = createContext(null);
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({ app_name: 'YallaLiv', currency: 'EGP' });
  useEffect(() => { api('/settings/public').then((s) => { setSettings(s); CUR = s.currency || 'EGP'; }).catch(() => {}); }, []);
  return <SetCtx.Provider value={{ settings }}>{children}</SetCtx.Provider>;
}
export const useSettings = () => useContext(SetCtx);

// ================= Auth =================
const AuthCtx = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem('yl_token')) { setReady(true); return; }
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => localStorage.removeItem('yl_token'))
      .finally(() => setReady(true));
  }, []);
  const login = async (email, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { email, password } });
    localStorage.setItem('yl_token', d.token);
    setUser(d.user);
    return d.user;
  };
  const register = async (body) => {
    const d = await api('/auth/register', { method: 'POST', body });
    localStorage.setItem('yl_token', d.token);
    setUser(d.user);
    return d.user;
  };
  const logout = () => { localStorage.removeItem('yl_token'); setUser(null); };
  return <AuthCtx.Provider value={{ user, setUser, ready, login, register, logout }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
export const homeFor = (u) => !u ? '/login' : u.role === 'superadmin' ? '/admin' : u.role === 'merchant' ? '/merchant' : u.role === 'driver' ? '/driver' : '/app';

// ================= Cart =================
const CartCtx = createContext(null);
const cartItem = (product, store, qty) => ({
  product_id: product.id, name: product.name, emoji: product.emoji, photo: product.photo || null, price: product.price, qty,
  store_id: store.id, store_name: store.name, delivery_fee: store.delivery_fee, min_order: store.min_order || 0
});
export function CartProvider({ children }) {
  const [items, setItems] = useState(() => { try { return JSON.parse(localStorage.getItem('yl_cart') || '[]'); } catch { return []; } });
  const [swap, setSwap] = useState(null);
  useEffect(() => { localStorage.setItem('yl_cart', JSON.stringify(items)); }, [items]);
  const add = (product, store) => {
    if (items.length && items[0].store_id !== store.id) { setSwap({ product, store }); return; }
    setItems((its) => {
      const ex = its.find((i) => i.product_id === product.id);
      if (ex) return its.map((i) => (i.product_id === product.id ? { ...i, qty: i.qty + 1 } : i));
      return [...its, cartItem(product, store, 1)];
    });
  };
  const confirmSwap = () => {
    if (!swap) return;
    const { product, store } = swap;
    setSwap(null);
    setItems([cartItem(product, store, 1)]);
  };
  const setQty = (pid, qty) =>
    setItems((its) => (qty <= 0 ? its.filter((i) => i.product_id !== pid) : its.map((i) => (i.product_id === pid ? { ...i, qty } : i))));
  const clear = () => setItems([]);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const store = items.length ? { id: items[0].store_id, name: items[0].store_name, delivery_fee: items[0].delivery_fee, min_order: items[0].min_order || 0 } : null;
  return (
    <CartCtx.Provider value={{ items, add, setQty, clear, count, subtotal, store, swap, confirmSwap, cancelSwap: () => setSwap(null) }}>
      {children}
    </CartCtx.Provider>
  );
}
export const useCart = () => useContext(CartCtx);

// ================= Polling hook =================
export function usePoll(fn, ms = 5000) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const run = () => { try { ref.current(); } catch {} };
    run();
    const id = setInterval(run, ms);
    return () => clearInterval(id);
  }, [ms]);
}

// ================= Toasts =================
let listeners = [];
export function toast(msg, type = 'ok') { listeners.forEach((l) => l(msg, type)); }
export function Toasts() {
  const [list, setList] = useState([]);
  useEffect(() => {
    const h = (m, t) => {
      const id = Math.random();
      setList((l) => [...l, { id, m, t }]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 3200);
    };
    listeners.push(h);
    return () => { listeners = listeners.filter((x) => x !== h); };
  }, []);
  if (!list.length) return null;
  return <div className="toast-wrap">{list.map((x) => <div key={x.id} className={'toast' + (x.t === 'err' ? ' err' : '')}>{x.m}</div>)}</div>;
}

// ================= v2 : texte / notifications / divers =================
export async function apiText(path) {
  const token = localStorage.getItem('yl_token');
  const res = await fetch('/api' + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  if (!res.ok) throw new Error('Erreur téléchargement');
  return res.text();
}
export function downloadCsv(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
// ================= v8 : conversion universelle d'images =================
const readFileAsDataUrl = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(new Error('read'));
  r.readAsDataURL(file);
});
const loadImageEl = (src) => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = () => rej(new Error('decode'));
  img.src = src;
});
/**
 * Convertit N'IMPORTE QUELLE image lisible par le navigateur (JPG, PNG, WebP, BMP, AVIF, SVG…)
 * en dataurl optimisee : redimensionnee (max 1600 px), compressee (JPEG .85 ou PNG si transparence),
 * et garantie sous 3 Mo. Les GIF animes passent tels quels (animation conservee).
 * Retourne { dataurl } ou { error: 'format' | 'too_big' }.
 */
/**
 * Photo produit/magasin : conserve la QUALITE D'ORIGINE.
 * - Entrée : TOUT format d'image jusqu'à 50 Mo
 * - Sortie : 2 versions optimisées SUR L'APPAREIL (économie de data + compatible hébergement gratuit) :
 *   • thumb   : max 320 px, JPEG ~0.8  -> listes, panier, suggestions
 *   • display : max 1600 px, JPEG ~0.87 -> fiche produit / photo agrandie
 */
async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {}
  }
  return new Promise((resolve, reject) => {   // repli vieux navigateurs
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('format')); };
    img.src = url;
  });
}
function drawScaled(img, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const hh = Math.max(1, Math.round(img.height * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = hh;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';              // JPEG : fond blanc (logos PNG transparents)
  ctx.fillRect(0, 0, w, hh);
  ctx.drawImage(img, 0, 0, w, hh);
  return c.toDataURL('image/jpeg', quality);
}
export async function processImage(file) {
  try {
    const MAX = 50 * 1024 * 1024;
    if (!file || !file.size) return { error: 'format' };
    if (file.size > MAX) return { error: 'too_big' };
    const img = await loadBitmap(file);
    if (!img.width || !img.height) return { error: 'format' };
    return { thumb: drawScaled(img, 320, 0.8), display: drawScaled(img, 1600, 0.87) };
  } catch { return { error: 'format' }; }
}

// URL d'une photo serveur : /api/photos/<id> (+ '/thumb' pour les listes, '/full' par défaut).
// Les anciennes URLs (/uploads/...) et les dataURLs locales passent telles quelles.
export const ph = (src, variant) => (typeof src === 'string' && src.startsWith('/api/photos/') ? src + '/' + (variant || 'full') : src);

export function notif(title, body) {
  try {
    // 📱 APK : notification locale native (le WebView ne supporte pas le Web Push)
    const LN = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
    if (LN) {
      LN.schedule({ notifications: [{ id: Math.floor(Math.random() * 1e9), title, body, schedule: { at: new Date(Date.now() + 150) } }] }).catch(() => {});
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body });
  } catch {}
}
export async function enableNotifications() {
  if (typeof Notification === 'undefined') return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}
// 🛵 ETA : distance à vol d'oiseau (mètres) + fourchette de minutes (préparation par type + 22 km/h en ville)
export function distM(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(a)));
}
export function etaRange(type, dist) {
  const prep = { restaurant: 20, market: 15, pharmacy: 10 }[type] || 15;
  const drive = dist == null ? 12 : Math.round((dist / 1000) * (60 / 22));
  const mid = prep + drive + 4;
  return [Math.max(10, Math.round((mid * 0.85) / 5) * 5), Math.round((mid * 1.3) / 5) * 5];
}

// 🆕 Mises à jour par interface : chaque rôle ne voit que LES SIENNES (bannière « Quoi de neuf »)
export const UPDATES = {
  client: [
    { v: '2026.09.21.6', items: [
      '🛰️ Bouton GPS : l’adresse de livraison se remplit automatiquement',
      '⏱️ Délai estimé affiché (cartes, commande, suivi en direct)',
      '🔑 Code de remise à 4 chiffres à donner au livreur',
      '🗺️ Suivi de commande avec timeline en temps réel',
      '⚠️ Erreurs de formulaires expliquées avec exemples',
    ] },
  ],
  merchant: [
    { v: '2026.09.21.6', items: [
      '🔔 Alarme forte + écran plein écran à chaque nouvelle commande',
      '🚫 Annulation possible à tout moment (même en cours de livraison)',
      '🖼️ Photos produit : « Autres photos » dès l’ajout (maximum 5)',
      '🛠️ Emoji de préparation universel (valable tous magasins)',
      '⚠️ Erreurs de formulaires expliquées avec exemples',
    ] },
  ],
  driver: [
    { v: '2026.09.21.6', items: [
      '📞💬🧭 Boutons Appeler / WhatsApp / Navigation sur chaque course',
      '🔑 Code de remise du client obligatoire pour valider la livraison',
      '↩️ Signalement « colis refusé par le client » avec motif',
      '🔙 Bouton retour du téléphone : ne quitte plus l’app (APK 3.1.6)',
      '🔔 Notifications Android natives dans l’app (APK 3.1.6)',
    ] },
  ],
};

export function UpdatesBanner({ role }) {
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem('yl_upd_' + role) || ''; } catch { return ''; } });
  const latest = (UPDATES[role] || [])[0];
  if (!latest || seen === latest.v) return null;
  const ok = () => { try { localStorage.setItem('yl_upd_' + role, latest.v); } catch {} setSeen(latest.v); };
  return (
    <div className="card" style={{ background: '#e0e7ff', border: '1px solid #6366f1', padding: '10px 14px', fontSize: 13, marginBottom: 10 }}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>🎉 Nouveautés de cette version</div>
      <ul style={{ margin: '0 0 8px 16px', padding: 0 }}>
        {latest.items.map((x, i) => <li key={i} style={{ marginBottom: 3 }}>{x}</li>)}
      </ul>
      <button className="btn sm" style={{ background: '#6366f1', color: '#fff' }} onClick={ok}>✓ Vu</button>
    </div>
  );
}

// ⚠️ Erreur sous un champ : texte rouge à l'endroit EXACT de la faute
export function FieldErr({ e }) {
  return e ? <div className="small" style={{ color: '#dc2626', fontWeight: 700, marginTop: 3 }}>⚠️ {e}</div> : null;
}

// Validateurs réutilisables : chaque message indique le champ fautif + un EXEMPLE concret
export const V = (t) => ({
  req: (label, ex, min = 1) => (v) => {
    const s = String(v ?? '').trim();
    if (!s) return label + ' — ' + t('v_required') + (ex ? ' (' + t('v_example') + ' : ' + ex + ')' : '');
    if (s.length < min) return label + ' — ' + t('v_too_short');
    return null;
  },
  name: (label, min = 2) => (v) => {
    const s = String(v ?? '').trim();
    return !s ? label + ' — ' + t('v_required') : s.length < min ? label + ' — ' + t('v_too_short') : null;
  },
  phone: (label) => (v) => {
    const d = String(v ?? '').replace(/\D/g, '');
    return d.length < 10 || d.length > 13 ? (label || t('phone')) + ' — ' + t('v_phone_bad') : null;
  },
  email: (label) => (v) => {
    const s = String(v ?? '').trim();
    if (!s) return (label || t('email')) + ' — ' + t('v_required');
    return !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? (label || t('email')) + ' — ' + t('v_email_bad') : null;
  },
  emailOpt: (label) => (v) => {
    const s = String(v ?? '').trim();
    return s && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? (label || t('email')) + ' — ' + t('v_email_bad') : null;
  },
  pass: (min = 5) => (v) => (String(v ?? '').length < min ? t('v_pass_short') : null),
  num: (label, min = 0, ex = '45.50') => (v) => {
    const n = parseFloat(v);
    return isNaN(n) || n < min ? label + ' — ' + t('v_price_bad') + ' : ' + ex : null;
  },
});
export const runV = (rules, values) => { const e = {}; for (const k of Object.keys(rules)) { const m = rules[k](values ? values[k] : undefined); if (m) e[k] = m; } return e; };
export const hasErr = (e) => Object.keys(e || {}).length > 0;

export function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const c = new Ctx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g); g.connect(c.destination);
    g.gain.value = 0.07; o.frequency.value = 880;
    o.start();
    setTimeout(() => { try { o.stop(); c.close(); } catch {} }, 160);
  } catch {}
}

// 🔔 Alerte forte marchand : n sonneries alternées (2 tons) + vibration — impossible à rater en cuisine
export function alarm(times = 10) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const c = new Ctx();
    const g = c.createGain();
    g.gain.value = 0.25;
    g.connect(c.destination);
    const t0 = c.currentTime;
    for (let k = 0; k < times; k++) {
      const o = c.createOscillator();
      o.frequency.value = k % 2 ? 1245 : 880;
      o.connect(g);
      o.start(t0 + k * 0.45);
      o.stop(t0 + k * 0.45 + 0.3);
    }
    setTimeout(() => { try { c.close(); } catch {} }, times * 450 + 600);
    try { navigator.vibrate?.([400, 200, 400, 200, 400]); } catch {}
  } catch {}
}

// ================= v3 : push web (VAPID) =================
function urlB64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
export async function pushSubscribe() {
  try {
    // 📱 APK : activer les notifications locales natives (Web Push indisponible en WebView)
    const LN = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
    if (LN) {
      const r = await LN.requestPermissions().catch(() => null);
      return r && r.display === 'granted' ? 'granted' : 'denied';
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
    const perm = await enableNotifications();
    if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'failed';
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const { vapid_public } = await api('/settings/public');
    if (!vapid_public) return 'nokey';
    const existing = await reg.pushManager.getSubscription();
    const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(vapid_public) });
    await api('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
    return 'granted';
  } catch { return 'failed'; }
}
