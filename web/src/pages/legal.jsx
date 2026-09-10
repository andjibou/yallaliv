import React from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../lib.jsx';
import { LangSwitch } from '../ui.jsx';

// Conditions générales d'utilisation + politique de confidentialité (FR / AR)
// Page publique, accessible sans compte (exigée par les stores d'applications et bonne pratique).

const CONTENT = {
  en: [
    ['📋 Purpose of the service', "YallaLiv is a platform connecting stores (restaurants, markets, pharmacies…), delivery drivers and customers for ordering and delivering products in Alexandria (Egypt). YallaLiv does not sell or prepare products: each business is responsible for its items, prices and information."],
    ['👤 Accounts', "Every user creates an account with a valid e-mail and a password. You are responsible for keeping your credentials confidential. Accounts may be suspended in case of abuse (fake orders, misconduct, breaking the rules)."],
    ['🛒 Orders & payment', "Orders are sent directly to the stores. Payment is made on delivery (cash, to the driver) unless stated otherwise. Displayed prices include the delivery fees shown before confirmation."],
    ['🛵 Delivery', "Deliveries are carried out by independent drivers (general or store-specific). Estimated times may vary with traffic and availability. For any issue (missing item, damage, major delay), contact support from your order page."],
    ['⚖️ Liability', "YallaLiv connects the parties but is not responsible for the quality, freshness or conformity of the products sold by stores, nor for incidents occurring during delivery. Each store and each driver remains responsible for their activity."],
    ['🔒 Personal data & privacy', "We only collect the data needed for the service: name, e-mail, phone, delivery address, order history and the driver’s position during the delivery. Your data is never sold or shared with commercial third parties. You can request the deletion of your account and data from your profile page or by contacting support."],
    ['📱 Notifications & photos', "The app may send notifications about your orders. Photos sent (store, products) are optimized and stored only for display within the service."],
    ['✏️ Changes to these terms', "These terms may evolve with the service. The current version is the one published on this page."],
    ['📬 Contact', "Support: via the app (Profile page) or the e-mail announced at the official launch."],
  ],
  fr: [
    ['📋 Objet du service', "YallaLiv est une plateforme de mise en relation entre des magasins (restaurants, marchés, pharmacies…), des livreurs et des clients pour la commande et la livraison de produits à Alexandrie (Égypte). YallaLiv ne vend ni ne prépare les produits : les commerces sont responsables de leurs articles, prix et informations."],
    ['👤 Comptes', "Chaque utilisateur crée un compte avec un e-mail valide et un mot de passe. Vous êtes responsable de la confidentialité de vos identifiants. Les comptes peuvent être suspendus en cas d'abus (fausses commandes, mauvaise conduite, non-respect des règles)."],
    ['🛒 Commandes & paiement', "Les commandes sont passées directement aux magasins. Le paiement se fait à la livraison (espèces, au livreur), sauf indication contraire. Les prix affichés incluent les frais de livraison indiqués avant confirmation."],
    ['🛵 Livraison', "Les livraisons sont assurées par des livreurs indépendants (généraux ou privés des magasins). Les délais sont estimés et peuvent varier selon le trafic et la disponibilité. En cas de problème (produit manquant, casse, retard important), contactez le support depuis votre commande."],
    ['⚖️ Responsabilités', "YallaLiv met en relation les parties mais n'est pas responsable de la qualité, la fraîcheur ou la conformité des produits vendus par les magasins, ni des incidents survenant pendant la livraison. Chaque magasin et chaque livreur reste responsable de son activité."],
    ['🔒 Données personnelles & confidentialité', "Nous collectons uniquement les données nécessaires au service : nom, e-mail, téléphone, adresse de livraison, historique de commandes et position du livreur pendant la course. Vos données ne sont jamais vendues ni partagées à des tiers commerciaux. Vous pouvez demander la suppression de votre compte et de vos données depuis votre profil ou en contactant le support."],
    ['📱 Notifications & photos', "L'application peut envoyer des notifications sur l'état de vos commandes. Les photos envoyées (magasin, produits) sont optimisées et stockées uniquement pour l'affichage du service."],
    ['✏️ Évolution des conditions', "Ces conditions peuvent évoluer avec le service. La version en vigueur est celle publiée sur cette page."],
    ['📬 Contact', "Support : via l'application (page Profil) ou l'e-mail indiqué lors de la mise en ligne officielle."],
  ],
  ar: [
    ['📋 الغرض من الخدمة', "يلا ليف منصة لربط المتاجر (مطاعم، أسواق، صيدليات…) بمندوبي التوصيل والعملاء لطلب المنتجات وتوصيلها في الإسكندرية (مصر). يلا ليف لا يبيع ولا يجهّز المنتجات: كل متجر مسؤول عن أغراضه وأسعاره ومعلوماته."],
    ['👤 الحسابات', "ينشئ كل مستخدم حساباً ببريد إلكتروني صحيح وكلمة مرور. أنت مسؤول عن سرية بيانات دخولك. يجوز إيقاف الحساب في حالة إساءة الاستخدام (طلبات وهمية، سلوك سيئ، عدم احترام القواعد)."],
    ['🛒 الطلبات والدفع', "تُرسل الطلبات مباشرة إلى المتاجر. الدفع عند التسليم (نقداً للمندوب) ما لم يُذكر غير ذلك. الأسعار المعروضة تشمل رسوم التوصيل الموضحة قبل التأكيد."],
    ['🛵 التوصيل', "يقوم بالتوصيل مندوبون مستقلون (عامون أو خاصون بالمتاجر). المدد المذكورة تقديرية وقد تتغير حسب الطريق والتوفر. عند وجود مشكلة (منتج ناقص، تلف، تأخر كبير) تواصل مع الدعم من صفحة طلبك."],
    ['⚖️ المسؤوليات', "يلا ليف يربط الأطراف فقط وليس مسؤولاً عن جودة أو طازجية أو مطابقة المنتجات التي يبيعها المتاجر، ولا عن الحوادث أثناء التوصيل. كل متجر وكل مندوب يبقى مسؤولاً عن نشاطه."],
    ['🔒 البيانات الشخصية والخصوصية', "نجمع فقط البيانات اللازمة للخدمة: الاسم، البريد، الهاتف، عنوان التوصيل، سجل الطلبات، وموقع المندوب أثناء التوصيلة. بياناتك لا تُباع ولا تُشارك مع أي جهة تجارية. يمكنك طلب حذف حسابك وبياناتك من صفحة حسابك أو بالتواصل مع الدعم."],
    ['📱 الإشعارات والصور', "قد ترسل التطبيق إشعارات عن حالة طلباتك. الصور المرسلة (المتجر، المنتجات) تُحسَّن وتُخزَّن لعرض الخدمة فقط."],
    ['✏️ تعديل الشروط', "قد تتطور هذه الشروط مع الخدمة. النسخة السارية هي المنشورة في هذه الصفحة."],
    ['📬 التواصل', "الدعم: عبر التطبيق (صفحة الحساب) أو البريد المعلن عند الإطلاق الرسمي."],
  ],
};

export default function Legal() {
  const { lang } = useLang();
  const sections = CONTENT[lang] || CONTENT.fr;
  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} style={{ maxWidth: 720, margin: '0 auto', padding: '18px 14px 40px' }}>
      <div className="row spread mb12">
        <Link to="/login" className="btn ghost sm">← {lang === 'ar' ? 'رجوع' : lang === 'en' ? 'Back' : 'Retour'}</Link>
        <LangSwitch />
      </div>
      <div className="card">
        <h2 style={{ margin: '0 0 4px' }}>{lang === 'ar' ? '📜 الشروط العامة وسياسة الخصوصية' : lang === 'en' ? '📜 Terms of use & privacy policy' : '📜 Conditions générales & confidentialité'}</h2>
        <p className="muted small">YallaLiv · يلا ليف — {lang === 'ar' ? 'الإسكندرية، مصر' : 'Alexandria, Egypt'} · v1.0</p>
        {sections.map(([title, text], i) => (
          <div key={i} style={{ marginTop: 14 }}>
            <div className="label mb4">{title}</div>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
