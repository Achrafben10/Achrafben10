# THE SYSTEM — Life OS · النظام — نظام الحياة

نظام إدارة حياة على شكل لعبة، مستوحى من «نظام الصيّاد» في Solo Leveling.
Life-management game inspired by the Hunter System from Solo Leveling.

**الحالة · Status:** المرحلة A مكتملة — المهام اليومية، ميزانية الوقت، الخبرة، الإثبات.
**Phase A shipped** — daily quests, time budget, XP, proof of work. See the roadmap below.

- مهام يومية (3–5) بميزانية **180 دقيقة** كحد أقصى · Daily quests (3–5) inside a hard **180-minute** budget
- `XP = الدقائق × 1.0 / 1.5 / 2.0` · XP = minutes × 1.0 / 1.5 / 2.0
- منحنى مستويات **+15%** لكل مستوى · Level curve grows **+15%** per level
- 5 سمات: القوة، الذكاء، الثروة، الإبداع، الانضباط · 5 stats: Strength, Intelligence, Wealth, Creativity, Discipline
- مؤقّت لكل مهمة + **إثبات إنجاز** (80% وقت + سطر) · Per-quest timer + **proof of work** (80% time + one line)
- واجهة كاملة بالعربية (RTL) والإنجليزية (LTR) · Full AR (RTL) + EN (LTR)
- يعمل بلا إنترنت بعد أول تحميل · Works offline after first load

---

## 1) التشغيل · How to open

**أسهل طريقة · Easiest:** افتح `index.html` مباشرة في المتصفح.
Just double-click `index.html`.

> ملاحظة: بعض المزايا (التثبيت، العمل بلا إنترنت) تحتاج سيرفر محلي أو استضافة.
> Some features (install, offline) need a local server or hosting.

### سيرفر محلي · Local server

```bash
cd system-os
python -m http.server 8017
```

ثم افتح · then open: <http://127.0.0.1:8017/>

---

## 2) التثبيت على الجوال · Install on phone

**آيفون / iPhone (Safari):** زر المشاركة ← «إضافة إلى الشاشة الرئيسية».
Share → *Add to Home Screen*.

**أندرويد / Android (Chrome):** قائمة ⋮ ← «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».
Menu ⋮ → *Install app* / *Add to Home screen*.

يجب أن يكون الموقع على `https://` أو `localhost` حتى يعمل التثبيت والعمل بلا إنترنت.
Install + offline require `https://` or `localhost`.

---

## 3) القواعد · Rules

### ميزانية الوقت · Time budget

- مجموع دقائق المهام اليومية **لا يتجاوز 180 دقيقة**. التطبيق يرفض أي إضافة أو تعديل يتجاوزها.
  The sum of daily quest minutes **never exceeds 180**. The app refuses any add or edit that breaks it.
- عدد المهام اليومية **3 إلى 5**: لا حذف تحت 3 ولا إضافة فوق 5.
  Daily count stays **3–5**: no deleting below 3, no adding above 5.
- الشريط يعرض `المستخدم / 180`، ويتحول إلى البرتقالي عند 80% والأحمر عند الامتلاء.
  The bar shows `used / 180`, turns amber at 80% and red when full.

### الخبرة والمستويات · XP and levels

| الصعوبة · Difficulty | المضاعف · Multiplier |
|---|---|
| سهلة · Easy | ×1.0 |
| عادية · Normal | ×1.5 |
| صعبة · Hard | ×2.0 |

- `خبرة المهمة = الدقائق × المضاعف` · `quest XP = minutes × multiplier`
- المستوى الأول يحتاج **100 خبرة**، وكل مستوى بعده **+15%**:
  100 → 115 → 132 → 152 → 175 …
  Level 1 needs **100 XP**, each next level costs **+15%** more.

### السمات · Stats

| السمة | تنمو عندما · Grows when |
|---|---|
| STR القوة | مهمة رياضة/صحة تُنجَز · a sport/health quest is cleared |
| INT الذكاء | مهمة تعلّم/لغات تُنجَز · a learning/language quest is cleared |
| WEA الثروة | مهمة مال/مشاريع تُنجَز · a money/project quest is cleared |
| CRE الإبداع | مهمة محتوى/فن تُنجَز · a content/art quest is cleared |
| DIS الانضباط | كل مهمة تُنجَز (+1، مرة واحدة) · every cleared quest (+1, once) |

### الإثبات · Proof of work

- لكل مهمة مؤقّت. اضغط **ابدأ المؤقّت** عند البدء و**إيقاف مؤقت** عند التوقف.
  Each quest has its own timer: **Start** / **Pause**.
- لا زر «تم»: المهمة تُقبل فقط عند **80% من الوقت المتتبع** + **سطر إثبات** واحد.
  No manual "done": a quest validates only at **80% tracked time** plus a **one-line note**.
- بعد القبول: خبرة + نمو السمة، ويُسجَّل اليوم في السجل.
  On acceptance: XP, stat growth, and the day is recorded.

### التأخير · Late

- إن حدّدت موعداً نهائياً للمهمة وأنجزتها بعده: **نصف الخبرة**، واليوم **لا يُحتسب مُنجَزاً**.
  With a deadline, finishing after it pays **half XP** and the day does **not** clear.

---

## 4) ما القادم · Roadmap

| المرحلة | المحتوى |
|---|---|
| **A (مكتملة)** | مهام + ميزانية 180 + خبرة + مستويات + مؤقّت وإثبات |
| B | FAIL عند أي مهمة ناقصة (−50% خبرة، تصفير السلسلة)، مهمة عقاب ≤15 دقيقة، CORE، قفل المهام، إيقاف طارئ |
| C | رتب E→S عبر اختبار أسبوعي (80% + سلسلة 5 أيام)، خفض الرتبة، حكم الأحد |
| D | زعيم شهري بخطوات، تصعيد الصعوبة بعد 7 أيام نظيفة، رسوم بيانية |

Phase B: no-mercy fail, −50% XP, streak reset, forced penalty quest, CORE locks, Emergency Pause.
Phase C: earned ranks, weekly exam, demotion, Sunday judgement.
Phase D: monthly boss, escalation, charts.

---

## 5) النسخ الاحتياطي · Backup

كل البيانات في `localStorage` داخل هذا المتصفح فقط.

- **الإعدادات ← تصدير**: يحمّل ملف JSON.
- **الإعدادات ← استيراد**: يستعيد الملف.
- **تصفير**: يمسح كل التقدم (لا يمكن التراجع).

> صدّر نسخة احتياطية أسبوعياً، خصوصاً قبل مسح بيانات المتصفح أو تغيير الجهاز.

الترقية من الإصدار القديم (v1) تلقائية: يحتفظ التطبيق بالمستوى والخبرة والسجل، ويعيد بناء المهام على الشكل الجديد.
Migration from v1 is automatic: level, XP and history are kept; quests are rebuilt on the new shape.

---

## 6) البنية · Structure

```
system-os/
├── index.html               هيكل التطبيق / app shell
├── manifest.webmanifest     إعدادات PWA
├── sw.js                    Service worker (offline)
├── css/style.css            التصميم بالكامل
├── js/
│   ├── i18n.js              القاموس EN/AR
│   ├── rules.js             دوال حسابية نقية: ميزانية، خبرة، إثبات
│   ├── core.js              الحالة والتخزين (schema v2)
│   ├── views.js             بناء واجهات العرض
│   ├── ui.js                التنقل، النوافذ، التنبيهات، المؤقّتات
│   └── app.js               التشغيل + PWA
├── assets/                  الأيقونات
└── tools/
    ├── test_rules.js        اختبارات الدوال النقية
    ├── test_core.js         اختبارات المحرك والحالة
    └── make_icons.py        توليد الأيقونات PNG
```

### تشغيل الاختبارات · Run tests

```bash
cd system-os
node tools/test_rules.js
node tools/test_core.js
```

---

## 7) ملاحظات · Notes

- لا حساب ولا سيرفر ولا تتبّع. كل شيء على جهازك.
  No account, no server, no tracking. Everything stays on your device.
- تغيير اللغة لا يغيّر النصوص التي كتبتها بنفسك.
  Switching language keeps your own typed text as-is.
- المؤقّت يعمل طالما الصفحة مفتوحة؛ إغلاق التطبيق يوقف العدّ ويحفظ ما تتبّع.
  Timers run while the page is open; closing the app stops counting and keeps what was tracked.
- التوقيت اليومي يعتمد على ساعة الجهاز؛ إن غيّرت المنطقة الزمنية قد يبدأ يوم جديد فوراً.
  Daily reset follows the device clock; a timezone change may trigger a new day.

---

*“You have acquired the qualifications to be a Player.”* — THE SYSTEM
