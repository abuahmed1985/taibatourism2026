// Seed data for the Taiba Tourism & Hospitality diploma (Render package).
// HONEST NOTE: the 16 courses / units / destinations / stats below are real
// structured content. The 208 questions per course are PROGRAMMATICALLY
// GENERATED from each unit's topic (see generateQuestions) as a working
// scaffold — they are NOT the original hand-written 3,328-question bank.
// The admin panel can import the real bank via CSV/JSON (see samples/).
'use strict';

const COURSES = [
  { code: 'TRM-101', level: 1, titleAr: 'مدخل إلى السياحة والفندقة', titleEn: 'Introduction to Tourism & Hospitality',
    descAr: 'مفاهيم السياحة والفندقة وأنواعها وأهميتها الاقتصادية والاجتماعية في المملكة.', descEn: 'Concepts of tourism and hospitality, types and economic importance in Saudi Arabia.',
    units: ['مفهوم السياحة وأنواعها', 'تاريخ السياحة وتطورها', 'قطاع الفندقة والضيافة', 'السياحة في المملكة العربية السعودية', 'أخلاقيات المهنة والسلوك المهني'] },
  { code: 'TRM-102', level: 1, titleAr: 'خدمة العملاء والضيافة', titleEn: 'Customer Service & Hospitality',
    descAr: 'مهارات خدمة الضيوف والتعامل مع الشكاوى وبناء تجربة ضيافة مميزة.', descEn: 'Guest service skills, complaint handling and memorable hospitality.',
    units: ['مفهوم خدمة العملاء', 'التواصل مع الضيوف', 'التعامل مع الشكاوى', 'جودة الخدمة وقياس رضا الضيوف', 'الضيافة السعودية وأصولها'] },
  { code: 'TRM-103', level: 1, titleAr: 'الاتصال والتواصل المهني', titleEn: 'Professional Communication',
    descAr: 'التواصل اللفظي وغير اللفظي والكتابة المهنية والعمل الجماعي.', descEn: 'Verbal and non-verbal communication, business writing and teamwork.',
    units: ['أساسيات الاتصال', 'الاتصال اللفظي وغير اللفظي', 'الكتابة المهنية والمراسلات', 'العرض والتقديم', 'العمل الجماعي وحل النزاعات'] },
  { code: 'TRM-104', level: 1, titleAr: 'أساسيات الفندقة والمكاتب الأمامية', titleEn: 'Hotel Basics & Front Office',
    descAr: 'أقسام الفندق والمكتب الأمامي وإجراءات الوصول والمغادرة.', descEn: 'Hotel departments, front office, check-in and check-out.',
    units: ['أقسام الفندق ووظائفها', 'المكتب الأمامي ومهامه', 'إجراءات الوصول والتسجيل', 'إجراءات المغادرة والمحاسبة', 'أنظمة إدارة الفنادق'] },
  { code: 'TRM-201', level: 2, titleAr: 'إدارة المكاتب الأمامية', titleEn: 'Front Office Management',
    descAr: 'إدارة الحجوزات والغرف والإشراف على فريق المكتب الأمامي.', descEn: 'Reservations, rooms and front-office team supervision.',
    units: ['إدارة الحجوزات', 'إدارة الغرف والإشغال', 'الكونسيرج وخدمات الضيوف', 'إدارة فريق المكتب الأمامي', 'مؤشرات الأداء في المكتب الأمامي'] },
  { code: 'TRM-202', level: 2, titleAr: 'إدارة الأغذية والمشروبات', titleEn: 'Food & Beverage Management',
    descAr: 'إدارة المطاعم وقوائم الطعام وسلامة الغذاء وخدمة المآدب.', descEn: 'Restaurants, menus, food safety and banquet service.',
    units: ['أنواع خدمات الأغذية والمشروبات', 'تصميم قوائم الطعام', 'سلامة الغذاء والنظافة', 'خدمة المطاعم والمآدب', 'تكاليف الأغذية والمشروبات'] },
  { code: 'TRM-203', level: 2, titleAr: 'التسويق السياحي', titleEn: 'Tourism Marketing',
    descAr: 'التسويق السياحي والترويج الرقمي وبناء العلامة السياحية.', descEn: 'Tourism marketing, digital promotion and destination branding.',
    units: ['أساسيات التسويق السياحي', 'دراسة السوق والشرائح', 'التسويق الرقمي ووسائل التواصل', 'الترويج والعروض السياحية', 'بناء العلامة السياحية للوجهة'] },
  { code: 'TRM-204', level: 2, titleAr: 'أنظمة الحجوزات', titleEn: 'Reservation Systems',
    descAr: 'أنظمة الحجز العالمية: أوبرا وأماديوس وسيبر ومنصات الحجز الإلكتروني.', descEn: 'Global reservation systems: Opera, Amadeus, Sabre and online platforms.',
    units: ['مدخل إلى أنظمة الحجز العالمية', 'نظام أوبرا Opera', 'نظام أماديوس Amadeus', 'نظام سيبر Sabre', 'منصات الحجز الإلكتروني'] },
  { code: 'TRM-301', level: 3, titleAr: 'إدارة الفنادق والمنتجعات', titleEn: 'Hotel & Resort Management',
    descAr: 'إدارة العمليات الفندقية والمنتجعات والتدبير المنزلي.', descEn: 'Hotel and resort operations and housekeeping management.',
    units: ['العمليات الفندقية', 'إدارة التدبير المنزلي', 'إدارة المنتجعات', 'الأمن والسلامة في الفنادق', 'إدارة الإيرادات والتسعير'] },
  { code: 'TRM-302', level: 3, titleAr: 'الإرشاد السياحي والوجهات', titleEn: 'Tour Guiding & Destinations',
    descAr: 'مهارات الإرشاد السياحي ومعالم المملكة ووجهاتها.', descEn: 'Tour guiding skills and Saudi destinations.',
    units: ['مهارات المرشد السياحي', 'وجهات المملكة: العلا والدرعية', 'وجهات المملكة: جدة والبحر الأحمر', 'وجهات المملكة: عسير والأحساء', 'تصميم البرامج والجولات السياحية'] },
  { code: 'TRM-303', level: 3, titleAr: 'إدارة الفعاليات والمؤتمرات', titleEn: 'Events & Conferences Management',
    descAr: 'تخطيط الفعاليات والمؤتمرات والمعارض وإدارتها.', descEn: 'Planning and managing events, conferences and exhibitions.',
    units: ['أنواع الفعاليات', 'تخطيط الفعاليات', 'إدارة المعارض والمؤتمرات', 'التسويق للفعاليات', 'تقييم الفعاليات وإدارة المخاطر'] },
  { code: 'TRM-304', level: 3, titleAr: 'الجودة وسلامة الضيوف', titleEn: 'Quality & Guest Safety',
    descAr: 'إدارة الجودة والسلامة والصحة في المنشآت السياحية والفندقية.', descEn: 'Quality, health and safety in tourism and hotel facilities.',
    units: ['مفهوم الجودة في الضيافة', 'معايير الجودة والتصنيف الفندقي', 'سلامة الغذاء والضيوف', 'إدارة الأزمات والطوارئ', 'التحسين المستمر وقياس الجودة'] },
  { code: 'TRM-401', level: 4, titleAr: 'إدارة الوجهات السياحية', titleEn: 'Destination Management',
    descAr: 'إدارة الوجهات وتطويرها واستدامتها وتسويقها.', descEn: 'Destination development, management and sustainability.',
    units: ['مفهوم إدارة الوجهات', 'تطوير الوجهات السياحية', 'التسويق للوجهات', 'استدامة الوجهات', 'الحوكمة والشراكات في الوجهات'] },
  { code: 'TRM-402', level: 4, titleAr: 'ريادة الأعمال السياحية', titleEn: 'Tourism Entrepreneurship',
    descAr: 'تأسيس المشاريع السياحية ودراسات الجدوى والتمويل.', descEn: 'Starting tourism businesses, feasibility and finance.',
    units: ['مفهوم ريادة الأعمال السياحية', 'دراسة الجدوى للمشروع السياحي', 'خطة العمل السياحي', 'التمويل والدعم الحكومي', 'إدارة المشروع السياحي الناشئ'] },
  { code: 'TRM-403', level: 4, titleAr: 'السياحة المستدامة ورؤية 2030', titleEn: 'Sustainable Tourism & Vision 2030',
    descAr: 'الاستدامة السياحية ومستهدفات رؤية المملكة 2030 ومشاريعها العملاقة.', descEn: 'Sustainable tourism, Vision 2030 targets and giga-projects.',
    units: ['مفهوم السياحة المستدامة', 'رؤية المملكة 2030: المحاور والأهداف', 'برامج تحقيق الرؤية', 'المشاريع العملاقة: نيوم والبحر الأحمر', 'دور المتدربة في تحقيق الرؤية'] },
  { code: 'TRM-404', level: 4, titleAr: 'التدريب التعاوني ومشروع التخرج', titleEn: 'Cooperative Training & Graduation Project',
    descAr: 'التدريب الميداني في المنشآت السياحية وإعداد مشروع التخرج.', descEn: 'Field training in tourism facilities and graduation project.',
    units: ['التدريب التعاوني: الأهداف والأنظمة', 'مهارات بيئة العمل', 'إعداد تقرير التدريب', 'مشروع التخرج: الفكرة والخطة', 'عرض مشروع التخرج ومناقشته'] },
];

const BOOKING_BOOKS = [
  { code: 'BKG-OPERA', titleAr: 'كتاب نظام أوبرا Opera للحجوزات الفندقية', titleEn: 'Opera Reservation System',
    descAr: 'شرح نظام أوبرا: الشاشات وخطوات الحجز وإدارة الغرف والفواتير.', descEn: 'Opera: screens, booking steps, rooms and billing.' },
  { code: 'BKG-AMADEUS', titleAr: 'كتاب نظام أماديوس Amadeus', titleEn: 'Amadeus Reservation System',
    descAr: 'شرح نظام أماديوس: حجز الطيران والفنادق والبحث عن الرحلات.', descEn: 'Amadeus: flights, hotels and availability search.' },
  { code: 'BKG-SABRE', titleAr: 'كتاب نظام سيبر Sabre', titleEn: 'Sabre Reservation System',
    descAr: 'شرح نظام سيبر: الأوامر الأساسية وحجز الطيران والفنادق.', descEn: 'Sabre: core commands, flights and hotels.' },
  { code: 'BKG-ONLINE', titleAr: 'كتاب منصات الحجز الإلكتروني', titleEn: 'Online Booking Platforms',
    descAr: 'منصات الحجز الإلكتروني وإدارة القنوات والتسعير الديناميكي.', descEn: 'Online platforms, channel management and dynamic pricing.' },
];

const DESTINATIONS = [
  { nameAr: 'العلا', nameEn: 'AlUla', descAr: 'مدائن صالح (الحجر) أول موقع سعودي في اليونسكو، وصحارى وتشكيلات صخرية ومعالم أثرية عمرها آلاف السنين.', descEn: 'Hegra, Saudi Arabia’s first UNESCO site, with ancient tombs and desert landscapes.',
    landmarks: 'مدائن صالح، جبل الفيل، البلدة القديمة، صخرة جبل عكمة', season: 'أكتوبر – مارس', activities: 'جولات أثرية، منطاد، فعاليات شتاء طنطورة', video: 'العلا مدائن صالح وثائقي' },
  { nameAr: 'الدرعية', nameEn: 'Diriyah', descAr: 'عاصمة الدولة السعودية الأولى وحي البجيري وحي الطريف التاريخي، رمز التاريخ والثقافة.', descEn: 'Capital of the first Saudi state, At-Turaif and Al-Bujairi districts.',
    landmarks: 'حي الطريف، حي البجيري، قصر سلوى، وادي حنيفة', season: 'نوفمبر – مارس', activities: 'جولات تراثية، مطاعم، فعاليات موسم الدرعية', video: 'الدرعية التاريخية' },
  { nameAr: 'جدة التاريخية', nameEn: 'Historic Jeddah', descAr: 'البلد: بيوت مرجانية وشرفات خشبية وأسواق قديمة على ضفاف البحر الأحمر.', descEn: 'Al-Balad: coral houses, wooden balconies and old souqs by the Red Sea.',
    landmarks: 'بيت نصيف، باب مكة، سوق العلوي، الكورنيش', season: 'نوفمبر – أبريل', activities: 'جولات في البلد، تسوق، مطاعم بحرية', video: 'جدة البلد' },
  { nameAr: 'البحر الأحمر', nameEn: 'The Red Sea', descAr: 'وجهة البحر الأحمر: جزر وشعاب مرجانية ومنتجعات فاخرة مستدامة.', descEn: 'Red Sea destination: islands, coral reefs and luxury sustainable resorts.',
    landmarks: 'جزر أملج، شعاب مرجانية، منتجعات البحر الأحمر', season: 'طوال العام', activities: 'غوص، سنوركل، إبحار', video: 'البحر الأحمر السعودية غوص' },
  { nameAr: 'عسير', nameEn: 'Asir', descAr: 'جبال السودة وأبها والضباب والقرى التراثية وطبيعة خضراء فريدة.', descEn: 'Soudah mountains, Abha, fog and heritage villages.',
    landmarks: 'جبل السودة، قرية رجال ألمع، منتزه عسير الوطني', season: 'يونيو – سبتمبر', activities: 'تسلق، تلفريك، مهرجانات صيفية', video: 'أبها السودة' },
  { nameAr: 'نيوم', nameEn: 'NEOM', descAr: 'مشروع نيوم العملاق: ذا لاين وأوكساجون وتروجينا وسياحة المستقبل.', descEn: 'NEOM giga-project: THE LINE, Oxagon and Trojena.',
    landmarks: 'ذا لاين، أوكساجون، تروجينا، سندالة', season: 'حسب المشروع', activities: 'سياحة مستقبلية، رياضات شتوية في تروجينا', video: 'نيوم ذا لاين' },
  { nameAr: 'الأحساء', nameEn: 'Al-Ahsa', descAr: 'أكبر واحة نخيل في العالم: جبل القارة وينابيع وعيون وتراث زراعي.', descEn: 'World’s largest palm oasis: Jabal Al-Qarah, springs and heritage.',
    landmarks: 'جبل القارة، عين جواثا، قصر إبراهيم، سوق القيصرية', season: 'نوفمبر – مارس', activities: 'جولات الواحة، كهوف، أسواق تراثية', video: 'الأحساء واحة النخيل' },
  { nameAr: 'مكة المكرمة والمدينة المنورة', nameEn: 'Makkah & Madinah', descAr: 'وجهتا السياحة الدينية: الحرم المكي والمسجد النبوي ومواقع التاريخ الإسلامي.', descEn: 'Religious tourism: the Grand Mosque and the Prophet’s Mosque.',
    landmarks: 'المسجد الحرام، المسجد النبوي، جبل أحد، قباء', season: 'طوال العام', activities: 'عمرة وزيارة، جولات تاريخية إسلامية', video: 'مكة المدينة' },
];

const STATS = [
  { value: '150', unit: 'مليون زيارة', labelAr: 'مستهدف الزيارات السنوية 2030', labelEn: 'Annual visits target 2030' },
  { value: '100', unit: 'مليون زيارة', labelAr: 'تحققت عام 2023 قبل الموعد', labelEn: 'Achieved in 2023, ahead of schedule' },
  { value: '10%', unit: 'من الناتج', labelAr: 'مساهمة السياحة المستهدفة في الناتج المحلي', labelEn: 'Target tourism share of GDP' },
  { value: '1.6', unit: 'مليون وظيفة', labelAr: 'وظائف سياحية مستهدفة بحلول 2030', labelEn: 'Tourism jobs targeted by 2030' },
  { value: '2030', unit: 'إكسبو', labelAr: 'الرياض تستضيف إكسبو 2030', labelEn: 'Riyadh hosts Expo 2030' },
  { value: '2034', unit: 'كأس العالم', labelAr: 'المملكة تستضيف كأس العالم 2034', labelEn: 'Saudi Arabia hosts World Cup 2034' },
  { value: '8', unit: 'وجهات', labelAr: 'وجهات سياحية رئيسية في هذا الدبلوم', labelEn: 'Key destinations in this diploma' },
  { value: '16', unit: 'مقرراً', labelAr: 'مقررات الدبلوم في 4 مستويات', labelEn: 'Diploma courses across 4 levels' },
  { value: '119', unit: 'صورة', labelAr: 'صور في المكتبة المرئية', labelEn: 'Photos in the media library' },
  { value: '10', unit: 'فيديوهات', labelAr: 'فيديوهات سياحية في المكتبة', labelEn: 'Tourism videos in the library' },
];

const NEWS_SEED = [
  { titleAr: 'انطلاق التسجيل في دبلوم السياحة والفندقة', titleEn: 'Registration opens for the Tourism & Hospitality Diploma', bodyAr: 'أعلن معهد طيبة العالي للتدريب فتح التسجيل في دبلوم السياحة والفندقة للمستويات الأربعة، مع كتب كاملة وبنوك أسئلة وتدريب تعاوني.' },
  { titleAr: 'المملكة تحقق 100 مليون زيارة قبل موعد 2030', titleEn: 'Kingdom reaches 100 million visits ahead of 2030', bodyAr: 'حققت المملكة مستهدف 100 مليون زيارة عام 2023، ورفعت المستهدف إلى 150 مليون زيارة بحلول 2030.' },
  { titleAr: 'موسم جديد للفعاليات السياحية في العلا والدرعية', titleEn: 'New tourism season in AlUla and Diriyah', bodyAr: 'تنطلق فعاليات موسمية جديدة في العلا والدرعية تشمل جولات تراثية وعروضاً ثقافية وفرص تدريب للمتدربات.' },
  { titleAr: 'دورات قصيرة في أنظمة الحجوزات: أوبرا وأماديوس', titleEn: 'Short courses in reservation systems: Opera & Amadeus', bodyAr: 'أضاف المعهد دورات تدريبية قصيرة في أنظمة الحجوزات العالمية أوبرا وأماديوس وسيبر.' },
  { titleAr: 'الرياض تستضيف إكسبو 2030', titleEn: 'Riyadh to host Expo 2030', bodyAr: 'فوز الرياض باستضافة إكسبو 2030 يفتح آلاف الفرص الوظيفية في السياحة والفندقة والفعاليات.' },
];

const TRAINING_SEED = [
  { titleAr: 'دورة نظام أوبرا للمكاتب الأمامية', titleEn: 'Opera for Front Office', hours: 20, descAr: 'تدريب عملي على شاشات أوبرا وخطوات الحجز وإدارة الغرف.' },
  { titleAr: 'دورة الإرشاد السياحي', titleEn: 'Tour Guiding Course', hours: 30, descAr: 'مهارات الإرشاد وتصميم الجولات والتعامل مع المجموعات السياحية.' },
  { titleAr: 'دورة خدمة العملاء والضيافة', titleEn: 'Customer Service & Hospitality', hours: 16, descAr: 'التعامل مع الضيوف والشكاوى وبناء تجربة ضيافة مميزة.' },
  { titleAr: 'دورة إدارة الفعاليات', titleEn: 'Events Management', hours: 24, descAr: 'تخطيط الفعاليات والمؤتمرات وإدارتها وتقييمها.' },
  { titleAr: 'دورة التسويق السياحي الرقمي', titleEn: 'Digital Tourism Marketing', hours: 18, descAr: 'التسويق عبر المنصات الرقمية وبناء العلامة السياحية.' },
];

const VIDEOS_SEED = [
  { titleAr: 'وثائقي مدائن صالح — العلا', titleEn: 'Hegra Documentary — AlUla', query: 'العلا مدائن صالح وثائقي' },
  { titleAr: 'جدة التاريخية — البلد', titleEn: 'Historic Jeddah — Al-Balad', query: 'جدة البلد التاريخية' },
  { titleAr: 'أبها والسودة — عسير', titleEn: 'Abha & Soudah — Asir', query: 'أبها السودة عسير' },
  { titleAr: 'غوص البحر الأحمر — فرسان', titleEn: 'Red Sea Diving — Farasan', query: 'البحر الأحمر غوص فرسان' },
  { titleAr: 'واحة الأحساء', titleEn: 'Al-Ahsa Oasis', query: 'الأحساء واحة النخيل' },
  { titleAr: 'الدرعية التاريخية', titleEn: 'Historic Diriyah', query: 'الدرعية التاريخية' },
  { titleAr: 'فيلم روح السعودية', titleEn: 'Visit Saudi Film', query: 'روح السعودية Visit Saudi' },
  { titleAr: 'نيوم — ذا لاين', titleEn: 'NEOM — THE LINE', query: 'نيوم ذا لاين' },
  { titleAr: 'السياحة في السعودية 2030', titleEn: 'Tourism in Saudi Arabia 2030', query: 'السياحة السعودية رؤية 2030' },
  { titleAr: 'الضيافة السعودية', titleEn: 'Saudi Hospitality', query: 'الضيافة السعودية فنادق' },
];

// Deterministic RNG so the bank is identical on every fresh seed.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const MCQ_STEMS = [
  { q: 'ما المفهوم الصحيح لـ«{u}» في سياق هذا المقرر؟', opts: ['المفهوم الأساسي المعتمد في المقرر وشرحه التفصيلي', 'إجراء إداري لا علاقة له بالموضوع', 'مصطلح من مقرر آخر غير مرتبط', 'تعريف ملغى من المناهج الحديثة'], correct: 0 },
  { q: 'أي مما يلي يعد من أهم أهداف «{u}»؟', opts: ['تحسين جودة الخدمة ورضا الضيوف', 'تقليل التواصل مع الضيوف', 'إلغاء معايير الجودة', 'الاعتماد على الاجتهاد الشخصي فقط'], correct: 0 },
  { q: 'ما الخطوة الأولى الصحيحة عند تطبيق «{u}»؟', opts: ['فهم المتطلبات والتخطيط الجيد', 'البدء دون تخطيط', 'تجاهل تعليمات المشرف', 'تأجيل العمل إلى النهاية'], correct: 0 },
  { q: 'أي سلوك مهني يعكس تطبيقاً صحيحاً لـ«{u}»؟', opts: ['الالتزام بالمعايير والتعامل باحترام مع الضيوف', 'تجاهل ملاحظات الضيوف', 'العمل دون توثيق', 'مخالفة إجراءات السلامة'], correct: 0 },
  { q: 'ما أثر إهمال «{u}» على تجربة الضيف؟', opts: ['انخفاض رضا الضيوف وسمعة المنشأة', 'تحسن فوري في الخدمة', 'لا أثر إطلاقاً', 'زيادة ولاء الضيوف تلقائياً'], correct: 0 },
  { q: 'في «{u}»، ما الإجراء الأفضل عند مواجهة مشكلة غير متوقعة؟', opts: ['الهدوء وتقييم الموقف واتباع الإجراء المعتمد', 'تجاهل المشكلة تماماً', 'تحميل المسؤولية للضيف', 'إيقاف العمل دون إبلاغ'], correct: 0 },
];
const TF_STEMS = [
  { q: '«{u}» من العناصر الأساسية لجودة الخدمة السياحية والفندقية.', correct: true },
  { q: 'يمكن تجاهل «{u}» دون أي أثر على رضا الضيوف.', correct: false },
  { q: 'يتطلب تطبيق «{u}» الالتزام بالمعايير والإجراءات المعتمدة.', correct: true },
  { q: '«{u}» يخص الإدارة فقط ولا علاقة له بالمتدربة.', correct: false },
];

function generateQuestions(course) {
  const questions = [];
  const r = rng(course.code.split('').reduce((a, c) => a + c.charCodeAt(0), 7));
  let n = 0;
  const perUnit = Math.floor(208 / 5); // 41 per unit, remainder in last unit
  course.units.forEach((unit, ui) => {
    const count = ui === 4 ? 208 - perUnit * 4 : perUnit;
    for (let i = 0; i < count; i++) {
      n++;
      if (i % 4 === 3) {
        const s = TF_STEMS[Math.floor(r() * TF_STEMS.length)];
        questions.push({ courseCode: course.code, type: 'tf', question: s.q.replace('{u}', unit), options: ['صح', 'خطأ'], correct: s.correct ? 0 : 1, explanation: 'راجعي شرح وحدة «' + unit + '» في الكتاب.' });
      } else {
        const s = MCQ_STEMS[Math.floor(r() * MCQ_STEMS.length)];
        // Shuffle options deterministically; correct answer must NOT always be (ب).
        const order = [0, 1, 2, 3].sort(() => r() - 0.5);
        const options = order.map(idx => s.opts[idx]);
        const correct = order.indexOf(s.correct);
        questions.push({ courseCode: course.code, type: 'mcq', question: s.q.replace('{u}', unit) + ' (سؤال ' + n + ')', options, correct, explanation: 'راجعي شرح وحدة «' + unit + '» في الكتاب.' });
      }
    }
  });
  return questions;
}

function generateLessons(unitTitle) {
  return [
    { titleAr: 'مفهوم ' + unitTitle, bodyAr: 'شرح مفصل لمفهوم ' + unitTitle + ' وأهميته في السياحة والفندقة، مع توضيح المصطلحات الأساسية والعلاقة بالممارسة المهنية اليومية.', exampleAr: 'مثال تطبيقي: موقف حقيقي من فندق أو وجهة سياحية يوضح تطبيق ' + unitTitle + ' خطوة بخطوة.', activityAr: 'نشاط: ناقشي مع زميلاتك موقفاً مشابهاً واقترحي الحل المهني المناسب.' },
    { titleAr: 'تطبيقات ' + unitTitle, bodyAr: 'التطبيقات العملية لـ' + unitTitle + ' في المنشآت السياحية والفندقية، والإجراءات المعتمدة والأدوات المستخدمة.', exampleAr: 'مثال تطبيقي: تنفيذ إجراء من إجراءات ' + unitTitle + ' في سيناريو محاكاة داخل القاعة.', activityAr: 'نشاط: طبقي الإجراء في مجموعة صغيرة ثم قيمي أداء زميلاتك.' },
    { titleAr: 'دراسة حالة في ' + unitTitle, bodyAr: 'دراسة حالة واقعية حول ' + unitTitle + '، وتحليل المشكلة والحلول والنتائج والدروس المستفادة.', exampleAr: 'مثال: دراسة حالة من وجهة سعودية توضح نجاح تطبيق ' + unitTitle + ' وأثره على رضا الضيوف.', activityAr: 'نشاط: مشروع قصير — أعدي عرضاً تقديمياً عن دراسة الحالة.' },
  ];
}

module.exports = { COURSES, BOOKING_BOOKS, DESTINATIONS, STATS, NEWS_SEED, TRAINING_SEED, VIDEOS_SEED, generateQuestions, generateLessons };
