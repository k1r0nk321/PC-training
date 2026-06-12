# PC-training 新疾患追加チェックリスト

---

## 【最重要】2026-06-12 改訂注記（新疾患追加時はまずここを確認）

- **評価は点数制ではなく「到達目標4項目の合否判定」**になりました（詳細は設計書「2026-06-12 大規模改訂サマリ」）。本チェックリスト内の「33点」等の採点記述は**旧仕様**です。新疾患でも到達目標4項目（生活指導／投薬／合併症評価／信頼度5）で評価されます。
- **「体重管理（減量）」の patient_education は作らない**（食事・運動・投薬の結果であり単独項目にしない方針）。
- **patient_education の表示ラベルは簡潔に**（例「減塩指導」）。`instruction_detail` に長文を入れても education API が短ラベルへ正規化しますが、最初から短い日本語ラベルを推奨。長文の説明は sub_options の description 等に。
- サブ選択肢のカテゴリ `education` は汎用の「概要・説明」見出しになります（服薬専用ではない）。
- 専門医コンサルトを「常に推奨」にしない。重症度・合併症で必要な場合のみ（例：高血圧の眼科は SBP≥160）。consultation-evaluator.js では `appropriate` に無条件で入れず `conditional`（condition 関数付き）にする。
- difficulty は数値 1/2/3、モデル症例タイトルは①〜⑤・難易度昇順で統一。

---


> このファイルは Claude Project Knowledge にアップロードしてください。
> 新疾患を追加する作業は最もバグが発生しやすい工程です。**全フェーズ・全項目をチェック**してください。
> 関連文書:
> - PC-training_プロジェクト指示.md(Custom Instructions 用)
> - PC-training_設計書・仕様書.md(全体仕様)


> **改訂履歴**
> - 2026-05-20: 高尿酸血症表示不具合の調査で判明したスキーマ実態に基づき全面改訂。テーブル名 `guidelines` → `guideline_items`、`hidden` → `is_active`、モデル症例は `cases.is_model_case` ではなく `model_cases` テーブルに格納、`consultations` テーブル不在(コードベース実装)、`category` の日本語統一などを反映。
> - 2026-05-21: 服薬指導 → adherence bonus 実装の知見を Phase 1.6/2.3、Phase 5.5/5.10 に反映。Phase 5.10「3 段ループ閉じ忘れ確認」を新設。Phase 2.9「Visit page 共通 UI への横展開」を新設。
> - 2026-05-28: CKD追加作業で判明した新バグパターン4件（patient_data構造誤認・変数名不一致・instruction_key英語表示・hasXXX定義漏れ）をPhase 2・5・付録Bに追記。


---


## ⚠️ なぜこのチェックリストが必要か


過去に「高尿酸血症・痛風」追加時、以下のバグが連鎖発生しました:


1. フェブキソスタットを処方しても UA がほぼ変化しない(薬剤検出 regex 未実装)
2. エゼチミブが定義済みなのに LDL 計算式で未使用
3. patient_education の選択肢に `strictness: 'none'` が大量混入し UI 破壊
4. UI を破壊して main / develop の状態が分からなくなる手動 revert
5. lifestyle_agreements に新カテゴリ追加忘れ
6. DISEASE_LAB_MAP 未登録で検査表示が全項目に膨張
7. **(2026-05-20 判明)** diseases に**重複行**を作ってしまい、データのある側が `is_active=false`、空の側が `is_active=true` という事故
8. **(2026-05-20 判明)** model_cases を `is_active=false` で投入してしまい、5 件全部が API レスポンスから除外されて「準備中」表示
9. **(2026-05-20 判明)** `category` を `metabolic`(英語)で投入し、フロントのカテゴリタブ判定で弾かれた
10. **(2026-05-20 判明)** `/api/diseases` の Vercel CDN キャッシュにより、DB を直しても本番に反映されなかった(本件は別途 PR #3 で根本対処済み)
11. **(2026-05-21 判明)** 服薬指導(`medication` カテゴリ)の sub_options が `patient_education` に登録されていたのに、visit2/visit3 route.js の計算式に**配線されていなかった**ため、選択しても adherence にまったく反映されない「3 段ループ閉じ忘れ」状態(PR #5 で配線追加して解消)
12. **(2026-05-28 判明)** `visit2/route.js` の計算式で `diseaseName` という変数名を使ったが、**実際の変数名は `const disease = caseData.disease_name`** であるため `diseaseName is not defined` エラーが発生し Visit2 生成が全件失敗（PR #7 で修正）
13. **(2026-05-28 判明)** `visit2/route.js` に新疾患の薬剤検出変数（`hasRAS_CKD` 等）を追加したつもりがコミットに含まれておらず `hasRAS_CKD is not defined` エラーで Visit2 生成失敗（PR #7 で修正）
14. **(2026-05-28 判明)** `patient_data` の `height`・`weight`・`bmi` は `patient.vitals` の中ではなく **`patient` 直下（トップレベル）** に格納されている。`patient.vitals.height` は `undefined` になるため、計算式・JSX 表示の両方で `patient.height || patient.vitals?.height` 形式で参照すること
15. **(2026-05-28 判明)** `patient_education` の各行を UI で表示する際、`edu.instruction_key`（英語スラッグ、例: `ckd_salt`）ではなく `edu.instruction_detail`（日本語説明文）を参照する必要がある。DB 投入時に `instruction_detail` を短い日本語ラベルとして設定すること（例: `減塩指導（目標3〜6g/日）`）


これらは全て**手順を守れば防げる**ので、本チェックリストに従ってください。


---


# Phase 0: 事前準備(疾患情報の整理)


## ☐ 0.1 医学的情報の決定


新疾患について以下を文書化(セッション冒頭で Claude に提示):


| 項目 | 例(2型糖尿病) | 例(高尿酸血症・痛風) |
|---|---|---|
| 疾患名(日本語正式) | 2型糖尿病 | 高尿酸血症・痛風 |
| 疾患名(英語) | Type 2 Diabetes Mellitus | Hyperuricemia / Gout |
| ICD10 コード | E11 | M10 |
| カテゴリ(日本語、既存と統一) | 代謝・内分泌 | 代謝・内分泌 |
| サブカテゴリ | 慢性疾患管理 | 慢性疾患管理 |
| 難易度レベル(1/2/3) | 2 | 2 |
| 主要検査項目 | HbA1c, glucose, urine_alb | ua, ua_clearance(必要なら追加) |
| 診断基準値 | HbA1c ≥ 6.5% | UA ≥ 7.0 mg/dL |
| 治療目標値 | HbA1c < 7.0% | UA < 6.0 mg/dL(痛風時 < 5.0) |
| 主要薬剤分類 | メトホルミン、DPP4、SGLT2、GLP1、SU、TZD、α-GI、グリニド、インスリン | XOI、尿酸排泄促進薬 |
| 関連科コンサルト | 眼科、腎臓内科(定型) | 整形外科(発作時)、腎臓内科(腎不全併発時) |
| 主要生活指導 | 食事、運動、減量、服薬、SMBG | 食事(プリン体・節酒)、減量、運動 |
| 教育のキーポイント | シックデイ、低血糖、合併症 | 痛風発作時の対応、薬剤遵守、関節保護 |
| 参考ガイドライン | 糖尿病治療ガイド最新版 | 高尿酸血症・痛風の治療ガイドライン 第3版 |


## ☐ 0.2 モデル症例の設計


最低 3 件(初級・中級・上級)、推奨 5 件。各症例は性格・アドヒアランス・難易度のバリエーションを持たせる。


| 難易度 | 想定する難しさ |
|---|---|
| 初級(★☆☆) | 協力的患者、典型例、合併症なし、治療ガイドライン直球で OK |
| 中級(★★☆) | 抵抗的 or 多忙な患者、ある程度の合併症併存 |
| 上級(★★★) | 多疾患併存、低 adherence、高齢、複雑な薬剤調整 |


---


# Phase 1: Supabase データ準備


> 🚨 全 INSERT で **`is_active=true`** を明示すること。デフォルト値が `false` で投入される箇所が複数あり、新疾患が「準備中」表示になる事故が頻発。


## ☐ 1.1 `diseases` テーブルへの insert


```sql
INSERT INTO diseases (
  id, name_ja, name_en, icd10_code, category, subcategory, 
  difficulty_level, is_active, sort_order
)
VALUES (
  gen_random_uuid(),
  '○○',                  -- name_ja(既存疾患と表記揺れさせない)
  'XXX',                  -- name_en
  'X00',                  -- icd10_code
  '代謝・内分泌',          -- category 🚨 日本語、既存疾患と統一
  '慢性疾患管理',          -- subcategory
  2,                       -- difficulty_level (1=初級, 2=中級, 3=上級)
  true,                    -- 🚨 is_active=true 必須
  (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM diseases)
);
```


### 🚨 重要チェック


- [ ] **`name_ja` の重複行が存在しない**(過去事故防止)
  ```sql
  SELECT id, name_ja, is_active FROM diseases WHERE name_ja = '○○';
  -- 1 行のみ返ることを確認
  ```
- [ ] **`category` が日本語**(`代謝・内分泌`、`循環器`、`呼吸器` 等。英語表記禁止)
  ```sql
  SELECT DISTINCT category FROM diseases WHERE is_active = true;
  -- 既存値と完全一致していること
  ```
- [ ] **`is_active = true`** で投入されている
- [ ] `sort_order` がカテゴリ内の他疾患との並びとして妥当か


挿入後、`SELECT id FROM diseases WHERE name_ja = '○○'` で UUID を控えておく(以降の SQL で使用)。


## ☐ 1.2 `guideline_items` テーブル(ガイドライン要約)


フィードバック評価時のプロンプトに埋め込まれる。簡潔に。


> 🚨 過去版設計書では `guidelines` と記載されていたが、**実テーブル名は `guideline_items`**。


```sql
INSERT INTO guideline_items (disease_id, content) VALUES (
  '<disease_id>',
  '【○○ 治療ガイドライン要約】
  - 診断基準: ...
  - 治療目標: ...
  - 第一選択薬: ...
  - 生活指導の重点: ...
  - 合併症スクリーニング: ...
  - 専門医紹介の目安: ...'
);
```


## ☐ 1.3 `medications` テーブル(薬剤候補)


疾患に対して使用される全薬剤分類を網羅。`drug_name_generic`、`drug_name_brand`、`medication_class` の 3 つを正確に。


**重要**: 後の薬剤検出 regex の判定材料になるため、**ブランド名・先発品名・後発品名**を含めて記載。


```sql
INSERT INTO medications (
  disease_id, drug_name_generic, drug_name_brand, medication_class, 
  default_dose, sort_order, is_first_line, recommendation_reason
)
VALUES
  ('<disease_id>', 'メトホルミン', 'メトグルコ', 'ビグアナイド', '500mg 1錠 朝夕食後', 10, true, '..'),
  ('<disease_id>', 'エンパグリフロジン', 'ジャディアンス', 'SGLT2阻害薬', '10mg 1錠 朝食後', 20, true, '..'),
  -- ...
```


## ☐ 1.4 `medical_devices` テーブル(必要な場合のみ)


SMBG、CGM、HOT、CPAP など。糖尿病なら SMBG/CGM。高尿酸血症ではほぼ不要。


## ☐ 1.5 専門医コンサルト(コード側で実装、テーブルなし)


> 🚨 過去版チェックリストでは `consultations` テーブルへの INSERT を指示していたが、**実際にはテーブルは存在せず**、`app/lib/consultation-evaluator.js` のルールベースで実装されている。


新疾患追加時は本ファイル直接編集(Phase 2.8 参照)。SQL での INSERT は不要。


## ☐ 1.6 `patient_education` テーブル(生活指導・患者教育)


カテゴリと sub_options を疾患特性に応じて投入。


```sql
INSERT INTO patient_education (disease_id, category, sub_options) VALUES (
  '<disease_id>',
  'salt',
  '[
    {"id":"salt_strict","label":"塩分 6g/日 未満厳守","category":"salt","strictness":"strong","description":"加工食品も含めて..."},
    {"id":"salt_mild","label":"塩分やや控えめ","category":"salt","strictness":"weak","description":"..."}
  ]'::jsonb
);
```


**🚨 重要ルール**:
- `strictness: 'none'` の選択肢は登録しない(UI 上で「無効」表示になる)
- 例外:`meal_3_regular`(規則的3食)、`continue_basal`(基礎インスリン継続)、`eating_out_guide`(外食指導)のような汎用ガイダンスのみ `none` を許可
- カテゴリの命名は他疾患と統一(salt、calorie、eating_out、night_eating、alcohol、aerobic、resistance、purine など)
- **`medication` カテゴリ** は服薬指導(お薬カレンダー、家族見守り、副作用説明等)用。選択数に応じて `effectiveAdherence` に最大 +0.20 の bonus を加算する仕組みが visit2/visit3 route.js に実装済み(2026-05-21)。**新規疾患でも `medication` カテゴリ sub_options を追加することで自動的に adherence 改善効果が働く**


### 高尿酸血症で必要だった新カテゴリ
- `purine`(プリン体制限)
- 既存の `alcohol`(節酒)を流用
- 既存の `aerobic`(有酸素運動)を流用


### 🚨 instruction_detail は日本語ラベルとして必ず設定すること（2026-05-28 追加）

`patient_education` の各行を UI で表示する際、`edu.instruction_detail` フィールドがメニューの見出しとして表示される。
投入時に `instruction_detail` を**短い日本語ラベル**（20文字以内推奨）に設定すること。

| NG（英語スラッグのまま） | OK（日本語ラベル） |
|---|---|
| `ckd_salt` | `減塩指導（目標3〜6g/日）` |
| `ckd_protein` | `蛋白質制限指導（管理栄養士連携）` |
| `ckd_medication` | `服薬指導・シックデイ対応` |

```sql
-- instruction_detail を設定する例
INSERT INTO patient_education (disease_id, category, instruction_key, instruction_detail, sub_options)
VALUES ('<disease_id>', 'diet', 'ckd_salt', '減塩指導（目標3〜6g/日）', '[...]'::jsonb);
```

### 服薬指導(medication カテゴリ)を疾患に追加する場合の sub_options 例
```json
[
  {"id":"med_pillbox","label":"お薬カレンダー/ピルケース導入","category":"medication","strictness":"weak"},
  {"id":"med_routine_link","label":"食事・歯磨き等の習慣と紐付け","category":"medication","strictness":"weak"},
  {"id":"med_family_support","label":"家族見守りでの服薬確認","category":"medication","strictness":"moderate"},
  {"id":"med_side_effect_education","label":"副作用説明と対処法指導","category":"medication","strictness":"strong"}
]
```
これら 4 個すべて選択で adherence +0.20、全 delta が約 +30% 強化される(教育的フィードバックループ)。


## ☐ 1.7 モデル症例の `model_cases` テーブルへの insert


> 🚨 過去版チェックリストでは `cases` テーブルに `is_model_case=true` で投入と記載していたが、**実際は別テーブル `model_cases` に投入する**。


各難易度別に最低 1 件、推奨 3〜5 件。**全件 `is_active=true` 必須**。


```sql
INSERT INTO model_cases (
  id, disease_id, disease_name, title, description,
  patient_data, scenario_data, sort_order, is_active
)
VALUES (
  gen_random_uuid(),
  '<disease_id>',
  '○○',                                      -- disease_name(diseases.name_ja と完全一致)
  '50代男性 健診で UA 高値',                  -- title
  '外食・ビール多飲、痛風発作なし。生活指導の典型例。',  -- description (1〜2行)
  '{...patient_data...}'::jsonb,
  '{
    "difficulty": 1,
    "key_points": [...],
    "expected_diagnosis": "...",
    "expected_medications": [...],
    "expected_lifestyle_guidance": ["プリン体制限","減量","節酒"]
  }'::jsonb,
  1,                                          -- sort_order(難易度初級→上級の順に 1〜5)
  true                                        -- 🚨 is_active=true 必須
);
```


### 🚨 重要チェック


- [ ] **`is_active=true`** を明示的に指定(これを忘れると 5 件全部が非表示になり「準備中」表示)
- [ ] `disease_name` が `diseases.name_ja` と完全一致(冗長保持のため)
- [ ] `sort_order` は 1〜5(難易度初級→上級の順)
- [ ] 投入後、件数を確認
  ```sql
  SELECT COUNT(*) FROM model_cases 
  WHERE disease_id = '<disease_id>' AND is_active = true;
  -- 投入数と一致すること
  ```


`patient_data` には以下を必須含める:
- name, age, gender, occupation, bmi, height, weight
- vitals(bp, hr, spo2, bt, rr)
- labs(疾患特有値 + 他疾患の baseline)
- history, chief_complaint, current_medications
- social_history, family_history, allergies
- hidden_params:
  - personality_type(cooperative / anxious / resistant / lazy / angry)
  - adherence_level(0.3〜0.9 もしくは low/medium/high)
  - eating_habit_label/comment、exercise_habit_label/comment
  - smoking_status(none / former / current)、smoking_pack_year
  - drinking_amount


---


# Phase 2: コード側更新


## ☐ 2.1 DISEASE_LAB_MAP の更新


各 Visit page (`app/cases/[id]/page.js`、`visit2/page.js`、`visit3/page.js`)に同じマップが定義されている。**全 3 ファイル**で更新が必要。


```javascript
const DISEASE_LAB_MAP = {
  '2型糖尿病': ['hba1c', 'glucose', 'urine_alb', 'ldl', 'hdl', 'tg', 'cr', 'egfr'],
  '高血圧症': ['na', 'k', 'cr', 'egfr', 'ldl', 'hdl', 'tg', 'urine_alb', 'bnp'],
  '脂質異常症': ['ldl', 'hdl', 'tg', 'total_cholesterol', 'non_hdl_c', 'ast', 'alt', 'ck'],
  '高尿酸血症・痛風': ['ua', 'cr', 'egfr', 'ldl', 'hdl', 'tg', 'urine_alb'],
  // ★ 新疾患をここに追加
  '○○': ['xxx', 'yyy', 'zzz'],
}
```


未登録だと LAB_ORDER 全項目が表示され、検査結果が見づらくなる。


## ☐ 2.1.1 exam-catalog.js への追加（2026-05-28 新設）

`app/lib/exam-catalog.js` に以下の3箇所を追加する。漏れると「検査オーダー画面に疾患専用検査が出ない」「ベースライン採血セットが出ない」「疾患のカラーテーマが適用されない」という問題が起きる。

### DISEASE_ITEMS（追加検査メニュー）
疾患固有の身体所見・血液検査・画像検査・生理検査を定義する。

```javascript
'慢性腎臓病': {
  physical: [
    { id: 'edema_check', label: '浮腫の確認（下腿・顔面）', subcategory: '身体所見' },
  ],
  lab: [
    { id: 'urine_alb_cr', label: '尿中アルブミン/Cr比（uACR）', subcategory: '蛋白尿', unit: 'mg/gCr' },
    { id: 'bun', label: 'BUN（血中尿素窒素）', subcategory: '腎機能', unit: 'mg/dL' },
    // ...
  ],
  imaging: [
    { id: 'renal_us', label: '腎臓エコー', subcategory: '画像' },
  ],
  physiology: [],
},
```

### BASELINE_PANELS（ベースライン採血セット）
疾患選択時に「ベースライン採血」として一括オーダーできるセットの説明文。

```javascript
'慢性腎臓病': {
  label: 'CKD ベースライン採血セット',
  description: 'Cr, eGFR, BUN, 尿Alb/Cr比, Na, K, Ca, P, UA, LDL, HDL, TG, HbA1c, Hb, 尿一般・沈渣',
},
```

### DISEASE_THEMES（カラーテーマ）
疾患タイルや検査画面の色を定義する。

```javascript
'慢性腎臓病': {
  primary: '#0891b2',      // メインカラー（シアン系）
  primaryDark: '#0e7490',
  accentBg: '#e0f2fe',
  accentText: '#0c4a6e',
  accentBorder: '#38bdf8',
  baselineBg: '#f0f9ff',
  baselineText: '#0c4a6e',
  badgeLabel: 'CKD',       // 疾患バッジの略称
},
```

### 既存疾患のテーマカラー参考
| 疾患 | primary | badgeLabel |
|---|---|---|
| 高血圧症 | `#0369a1`（青） | HT |
| 2型糖尿病 | `#047857`（緑） | DM |
| 脂質異常症 | `#be185d`（ピンク） | HL |
| 高尿酸血症 | `#7c3aed`（紫） | UA |
| 慢性腎臓病 | `#0891b2`（シアン） | CKD |

## ☐ 2.2 薬剤検出パターンの追加(visit2/route.js + visit3/route.js)


`app/api/visit2/route.js` の line 282-292 周辺に `hasXxx = /.../.test(consentedMedNames)` の検出パターンが集まっている。


新薬剤分類は必ずここに追加。例(高尿酸血症の場合):


```javascript
const hasXOI = /フェブキソスタット|フェブリク|フェブリック|アロプリノール|ザイロリック|サロベール|トピロキソスタット|トピロリック/.test(consentedMedNames)
const hasUricosuric = /プロベネシド|ベネシッド|ベンズブロマロン|ユリノーム|ドチヌラド|ユリス/.test(consentedMedNames)
```


**🚨 注意**:
- 先発品名・後発品名・一般名・分類名(英語含む)を全て regex に含める
- ジェネリック名揺れに注意(「ブレンディル」「アムロジン」など同成分別ブランド)
- visit3/route.js にも同じ検出が必要(忘れがち)


## ☐ 2.2.1 薬剤検出変数名とroute.jsの変数名の一致確認（2026-05-28 新設）

`visit2/route.js` と `visit3/route.js` では、**コード内の既存変数名が優先される**。新疾患の検出変数を追加するときは以下を確認：

- `visit2/route.js` での疾患名変数は `const disease = caseData.disease_name`（`diseaseName` ではない）
- 追加した `const hasXXX = ...` が実際にコミットされているか確認（ページ保存後に生テキストで grep）
- `visit3/route.js` は `v3MedNames` を使用（`consentedMedNames` ではない）

```bash
# 定義と使用が両方あるか確認
grep "const hasRAS_CKD\|hasRAS_CKD" app/api/visit2/route.js
grep "const disease \|diseaseName" app/api/visit2/route.js
# → "const disease = " は OK、"diseaseName" は NG
```

## ☐ 2.3 薬剤効果の計算式への組み込み


`visit2/route.js` の line 295-360 で各検査値の delta 計算。検出のみで未使用にしない。


### チェック項目
- [ ] **`patient.height`・`patient.weight`・`patient.bmi` はトップレベル参照**（`patient.vitals.height` は `undefined`）
  ```javascript
  // NG: patient.vitals.height（vitalsには入っていない）
  // OK: patient.height || patient.vitals?.height
  ```
- [ ] HbA1c に新糖尿病薬の効果を加算(oralCount に含めるか、独立効果か)
- [ ] LDL に新脂質薬の効果(PCSK9 のような大幅低下薬は -50% 等)
- [ ] TG に新薬の効果(EPA など)
- [ ] UA に新尿酸関連薬の効果(XOI -2.5、uricosuric -1.7 等)
- [ ] BP に新降圧薬(現状包括 medEffect なので個別不要、ただし将来分離検討)
- [ ] 副作用としての検査値悪化(例:利尿薬 → UA 上昇)
- [ ] visit3/route.js にも同じ計算が必要
- [ ] **`medicationGuidanceBonus`** の式が visit2/visit3 両方にあるか(2026-05-21 追加、第 5.5 節「服薬指導の配線」も参照):
  ```javascript
  const medicationSubs = consentedSubs.filter(s => s.category === 'medication')
  const medicationGuidanceBonus = Math.min(0.20, medicationSubs.length * 0.05)
  // effectiveAdherence の式に + medicationGuidanceBonus
  ```


### 効果量の目安(4 週間時点での妥当な臨床反応)


| 薬剤分類 | 主作用 | delta 値 |
|---|---|---|
| メトホルミン/DPP4/SU/TZD/α-GI/グリニド | HbA1c | oralCount 段階的 -0.7/-1.3/-1.8(累積上限) |
| デュラグルチド | HbA1c 直接 | -0.6 |
| インスリン | HbA1c | -1.0 |
| SGLT2、GLP1 | HbA1c | 体重減少経由のみ |
| スタチン | LDL | -35% |
| エゼチミブ | LDL | -18% |
| PCSK9 | LDL | -50% |
| フィブラート | TG | -30%(低 TG)、35% (高 TG) |
| スタチン | TG | -10% |
| EPA | TG | -20% |
| フィブラート | HDL | +3 |
| スタチン | HDL | +2 |
| XOI(フェブキソスタット等) | UA | -2.5 mg/dL |
| 尿酸排泄促進薬 | UA | -1.7 mg/dL |
| SGLT2 | UA | -0.3 mg/dL |
| 利尿薬 | UA | +0.5 mg/dL(副作用) |


全 delta は最後に `* adherenceFactor`(0.5-1.0)でスケーリング。


## ☐ 2.4 evaluate-params の対応(必要なら)


通常は新疾患でも evaluate-params の修正は不要。ただし以下の場合は確認:


- 新疾患特有の生活変容カテゴリ(例:プリン体制限)を `lifestyle_agreements` に追加したい
  → `evaluate-params/route.js` の `lifestyle_agreements_update` の `category` 列挙に新カテゴリを追加
  → mergedAgreements ロジックの labels マップにも追加
- 新疾患特有のラベル進行(例:「禁酒挑戦中」→「節酒成功」)
  → `visit-parameters/route.js` の `progressDrinkingLabel` 等を確認


## ☐ 2.5 feedback / visit3-feedback API の対応(必要なら)


通常は新疾患でも修正不要。ただし以下の場合は確認:


- 新疾患特有のサマリ表示(buildVisit2Summary、buildV1V2Summary 内の `caseData.disease_name === '○○'` 分岐)
- 新疾患のフィードバック観点(例:痛風発作時の対応など)が必要なら、プロンプトに疾患別ヒントを追加


## ☐ 2.6 patient-reaction API の対応(必要なら)


通常は不要。ただし:
- 新薬剤に対する患者反応の特性(例:インスリンへの抵抗感)を強調したい場合のみ調整


## ☐ 2.7 auto-treatment (担当医任せ) の対応


`app/lib/auto-treatment-rules.js` で新疾患の自動治療選択ロジック追加が必要。


`getAutoTreatmentSelections(diseaseName, patientData)` 関数内に疾患分岐を追加:


```javascript
if (diseaseName === '○○') {
  // モデル症例から推奨される標準治療を返す
  return {
    medications: [...],     // 第一選択薬
    devices: [...],
    consultations: [...],   // 定型コンサルト
    education_options: [...] // 推奨生活指導
  }
}
```


## ☐ 2.8 consultation-evaluator.js の対応


`app/lib/consultation-evaluator.js` で疾患別コンサルト適切性ルール追加(これがコンサルトマスタ相当)。


各 specialty を `定型連携` / `条件該当` / `生活指導専門資源` / `過剰` のいずれかに分類するルール定義。新疾患追加時は本ファイルに疾患分岐を足す。


## ☐ 2.9 Visit page 共通 UI への横展開(該当時のみ、2026-05-21 追加)


新疾患追加では通常不要だが、**治療方針セクション(投薬・コンサルト・生活指導・検査)の UI を変更する場合**は必ず 3 ファイルすべてに同じ改修を適用。


- `app/cases/[id]/page.js`(Visit 1)
- `app/cases/[id]/visit2/page.js`
- `app/cases/[id]/visit3/page.js`


これらは設計上コピーペーストで複製されているため、1 ファイルだけ修正すると Visit 切替で UI 不整合が起きる(設計書 11.11 節参照)。


**機械的横展開の手順**:
1. Visit 1 で改修して動作確認
2. visit2/page.js を取得 → 同じ str_replace anchor で改修(同一構造)
3. visit3/page.js も同様
4. 3 ファイル分の Vercel ビルド成功を確認


---


# Phase 3: AI プロンプトの確認(通常変更不要)


## ☐ 3.1 cases/route.js の症例生成プロンプト


ランダム生成時のプロンプトで、新疾患の name_ja を認識して妥当な patient_data / scenario_data を生成できるか。
通常はガイドライン情報を `guideline_items` テーブルから読むので追加修正不要。


## ☐ 3.2 patient-reaction の患者反応プロンプト


疾患名と治療項目から AI が患者反応を生成。プロンプト本体には疾患名のリテラル列挙はないので追加修正不要。


## ☐ 3.3 ai/route.js の患者役プロンプト


疾患名 + patient_data + 問診履歴で患者として応答。新疾患でも汎用的に動作するため修正不要。


---


# Phase 4: 動作確認(デプロイ後)


## ☐ 4.1 症例一覧画面


- [ ] 疾患選択画面に新疾患が表示される(is_active=true)
- [ ] 疾患が「**準備中** 📋」ではなく「**✓ N 症例**」(緑バッジ)で表示される
  - もし「準備中」のまま → `model_cases` の `is_active` を再確認(Phase 1.7 漏れ)
  - もし疾患タイルが出ない → `category` が日本語で他疾患と統一されているか確認(Phase 1.1)
- [ ] モデル症例選択モーダルで難易度順に並ぶ(初級が上)
- [ ] 「ランダム症例」「モデル症例」両方で開始できる


## ☐ 4.1.1 生活指導・投薬の臨床的整合性レビュー（2026-05-28 新設）

動作確認の前に、疾患ガイドラインと照らして以下を確認する。

### 投薬（medications テーブル）
- [ ] 第一選択薬・第二選択薬の優先順位が正しいか（`sort_order`・`is_first_line`）
- [ ] 禁忌薬・注意薬が含まれていないか（例: CKD eGFR<30 でのメトホルミン）
- [ ] 薬剤名（一般名・ブランド名）が visit2/visit3 route.js の regex に含まれているか（Phase 2.2）
- [ ] 薬剤効果の delta 値が臨床的に妥当か（Phase 2.3 の効果量目安表を参照）

### 生活指導（patient_education テーブル）
- [ ] 疾患に合ったカテゴリが揃っているか（例: CKD → diet/蛋白制限・減塩、smoking、exercise）
- [ ] `strictness` 段階（weak/moderate/strong）が臨床的に意味のある差になっているか
- [ ] `instruction_detail` が短い日本語ラベルになっているか（Phase 5.13）
- [ ] 疾患特有の生活指導カテゴリを追加した場合、visit2/visit3 route.js の計算式に配線されているか（Phase 5.10 の3段ループ確認）

### 担当医任せモード（auto-treatment-rules.js）
- [ ] `decideXXX()` 関数が疾患ガイドラインに沿った治療を自動選択するか
- [ ] 生活指導の自動選択に疾患特有の優先項目が反映されているか

## ☐ 4.2 Visit 1 通し


- [ ] 患者特性パネル(ParameterPanel)が正しく表示される
- [ ] 問診で患者が自然に応答する(疾患特性を反映)
- [ ] 患者特性が問診中に動的更新される(評価意欲 ★、食生活ラベル等)
- [ ] 細かいモードで指導医コーチングが新疾患を踏まえた内容で出る
- [ ] 検査オーダーで関連検査が選べる
- [ ] 治療方針で新薬剤分類が選択肢に出る
- [ ] 治療方針で生活指導の sub_options が strictness 順に並ぶ
- [ ] 担当医任せボタン(非医師身分)が機能する


## ☐ 4.3 Visit 2 通し


- [ ] Visit 2 開始時、患者の開頭挨拶が患者特性・アドヒアランスに沿う
- [ ] 検査値が**臨床的に妥当な変化幅**を示す
  - 例:フェブキソスタット服用 + 良好 adherence → UA 8.2 → 約 6.0(-2.2)
  - 例:メトホルミン + SGLT2 → HbA1c 7.8 → 6.5-6.8 程度
  - 例:スタチン + エゼチミブ → LDL 165 → 95 前後(-43%)
- [ ] 検査値が異常に小さい変化(-0.1 等)になっていない → なっていれば**薬剤検出 regex 漏れ**を疑う
- [ ] Visit 1 → 2 の検査値比較表示が正しい
- [ ] 喫煙・飲酒ラベルが Visit 移行で進行する


## ☐ 4.4 Visit 3 + フィードバック


- [ ] Visit 3 でも検査値が妥当に推移
- [ ] Visit 3 フィードバックで疾患特有の評価が出る
- [ ] スコア配分(問診33+生活指導34+治療33 = 100)が機能(医師)
- [ ] 学習者モードでは治療部分が評価対象外と明示


---


# Phase 5: バグ予防の最終チェック


## ☐ 5.1 is_active 系の確認(2026-05-20 新設)


新疾患の関連データが**すべて `is_active=true`** で投入されているか SQL で確認。


```sql
-- 疾患マスタ
SELECT id, name_ja, category, is_active FROM diseases 
WHERE name_ja = '○○';
-- 期待: 1 行のみ、is_active=true、category は日本語


-- モデル症例(全件 is_active=true であること)
SELECT COUNT(*) AS total,
       SUM(CASE WHEN is_active THEN 1 ELSE 0 END) AS active_count
FROM model_cases WHERE disease_id = '<disease_id>';
-- 期待: total と active_count が一致


-- 他関連テーブル(is_active 列があれば確認)
SELECT 'medications' AS tbl, COUNT(*) FROM medications WHERE disease_id = '<disease_id>'
UNION ALL
SELECT 'guideline_items', COUNT(*) FROM guideline_items WHERE disease_id = '<disease_id>'
UNION ALL
SELECT 'patient_education', COUNT(*) FROM patient_education WHERE disease_id = '<disease_id>';
```


## ☐ 5.2 重複行チェック(2026-05-20 新設)


```sql
SELECT name_ja, COUNT(*) AS row_count
FROM diseases
WHERE name_ja = '○○'
GROUP BY name_ja;
-- row_count = 1 であること(2 以上なら重複事故)
```


## ☐ 5.3 薬剤検出の漏れ確認


新疾患特有の薬を 1 つずつ処方してみて、Visit 2 で検査値が臨床的に妥当に動くか確認。


```
Test case 1: <疾患> + 第一選択薬 → 検査値 X が Δ_期待 だけ変化したか?
Test case 2: <疾患> + 第二選択薬 → 同上
Test case 3: <疾患> + 併用 → 検査値が累積効果を示すか?
```


## ☐ 5.4 sub_options の strictness チェック


```sql
SELECT id, sub_options FROM patient_education WHERE disease_id = '<id>';
-- jsonb 内の strictness フィールドを目視確認
```


`strictness: 'none'` が混入していないか(例外 3 件を除く)。


## ☐ 5.5 検出は OK だが計算未使用 になっていないか


`visit2/route.js` を grep して、`const hasXxx = ...` が定義されているのに `if (hasXxx)` で使用されていない変数がないか確認。


```bash
# 検出のみされて使われていない変数を列挙
grep "const has" app/api/visit2/route.js | grep -o "has[A-Z][a-zA-Z]*" | while read v; do
  count=$(grep -c "if (\$v)" app/api/visit2/route.js)
  echo "$v: $count usages"
done
```


## ☐ 5.6 evaluate-params のスキーマ整合性


`app/api/evaluate-params/route.js` で以下 3 箇所のフィールド名が完全一致するか:


1. プロンプト例(rule B)
2. JSON 出力スキーマ(プロンプト末尾)
3. `newParams` オブジェクト


例えば新フィールド `purine_label` を追加するなら、3 箇所すべてに同名を記載。


## ☐ 5.7 DISEASE_LAB_MAP の全 page 反映


```bash
grep "DISEASE_LAB_MAP" app/cases/[id]/page.js app/cases/[id]/visit2/page.js app/cases/[id]/visit3/page.js
```


3 ファイル全てで新疾患エントリが含まれているか。


## ☐ 5.8 visit2_data / visit3_data のキャッシュ


新疾患追加前に作成された既存ケースは古い visit2_data がキャッシュされている可能性あり。テスト時は新ケースで確認。


## ☐ 5.9 Vercel CDN キャッシュの確認(2026-05-20 新設)


本番反映確認時、`/api/diseases` のレスポンスヘッダで `x-vercel-cache: MISS` であることを確認。


```javascript
// ブラウザ DevTools Network タブ、または以下を console で実行
fetch('/api/diseases?probe=' + Date.now(), { cache: 'no-store' })
  .then(r => console.log('cache:', r.headers.get('x-vercel-cache'), 'age:', r.headers.get('age')))
```


- 期待: `cache: MISS, age: 0`
- もし `cache: HIT, age: NNN` だったら → `app/api/diseases/route.js` の `export const dynamic = 'force-dynamic'` が消えている可能性。設計書 第 11.8 節参照。


## ☐ 5.10 3 段ループ閉じ忘れの確認(2026-05-21 新設)


新疾患/新カテゴリ追加では「**フロント表示 → DB 保存 → 計算反映**」の 3 段すべてが繋がっているか確認する。途中で切れていると「画面で選択できて DB にも入るのに、検査値が動かない」状態になる(設計書 11.9 節)。


### チェック項目


| 段階 | 確認方法 |
|---|---|
| 1. フロント表示 | 該当 visit page で sub_options が `<select>` または `<button>` で表示されるか(実機確認) |
| 2. DB 保存 | Visit 完了後、`visit_parameters.lifestyle_agreements` または `cases.saved_state` に `acceptance_level` 付きで記録されているか(SQL で確認) |
| 3. 計算反映 | visit2/route.js と visit3/route.js を grep して、新カテゴリ名(例: `'medication'`、`'purine'`)が **`consentedSubs.filter(s => s.category === '<新カテゴリ>')` または同等の参照**で計算に使われているか |


### 動作確認テスト


新カテゴリの sub_options を 1〜複数選択して Visit 2/3 に進んだとき、検査値が**選択数に応じて変化する**ことを確認。変化しなければ計算式に配線されていない(=「ループ閉じ忘れ」)。


```bash
# 計算式に新カテゴリが組み込まれているか確認
grep "category === '<新カテゴリ>'" app/api/visit2/route.js app/api/visit3/route.js
# 0 件なら配線漏れ → 設計書 11.9 節を参照して計算式を追加
```


### 配線方法のヒント


- 生活習慣系のカテゴリ → `lifestyleEffect` または `saltEffect` に加算
- 服薬遵守系のカテゴリ → `effectiveAdherence` の bonus として加算(全 delta をスケーリング)
- カテゴリ独自の効果がある場合 → 該当検査値の delta 計算に直接組み込む


### 過去の実例


**2026-05-21、PR #5**: `medication` カテゴリの sub_options が DB に登録されていたが visit2/visit3 route.js で参照されていなかった。配線追加で「服薬指導が薬効に反映される」教育的ループが完成。


## B-2: 慢性腎臓病(2026-05-28 追加、PR #7)

### 実装済み内容
- diseases: `evaluation_category='process_asymptomatic'`、`symptom_check_fields` 設定
- guideline_items: 7件（KDIGO 2024準拠）
- guideline_rules: 24件（first_line/contraindication/referral/lifestyle/monitoring）
- medications: 8件（ARB・ACE阻害薬・SGLT2阻害薬・Ca拮抗薬・ループ利尿薬・HIF-PH阻害薬）
- patient_education: 8件（diet×3・smoking・exercise・lifestyle・medication・emergency）
- model_cases: 5件・**is_active=false**（preview環境のみ表示）

### 本番公開時のSQL
```sql
UPDATE model_cases SET is_active = true
WHERE disease_id = '9893620e-bdce-461c-a7f3-4186c7ee6aef';
```

### 実際に発生したバグ
1. **`diseaseName is not defined`** — route.jsの変数名は `disease`（Phase 5.11 で防止）
2. **`hasRAS_CKD is not defined`** — 検出変数の定義がコミットに含まれていなかった（Phase 5.11 で防止）
3. **身長・体重が空欄** — `patient.vitals.height`（undefined）を参照していた（Phase 5.12 で防止）
4. **生活指導メニューが英語** — `edu.instruction_key`（`ckd_salt`等）をラベルに使用。`edu.instruction_detail` に変更（Phase 5.13 で防止）
5. **`instruction_detail` が長文説明文** — DB投入時から短い日本語ラベルとして設定すること（Phase 1.6, 5.13 参照）


---


# 付録 A: SQL テンプレート(STEP 形式)


ユーザー(中前先生)が Supabase ダッシュボードで実行する形式。


```
STEP 1: diseases に挿入(is_active=true、category 日本語)
STEP 2: disease_id を控える
STEP 3: guideline_items 挿入
STEP 4: medications 挿入(複数行)
STEP 5: medical_devices 挿入(必要なら)
STEP 6: patient_education 挿入(category 別に複数 INSERT)
STEP 7: model_cases(モデル症例)挿入(各難易度ごと、is_active=true 必須)
STEP 8: 整合性確認クエリ(Phase 5.1 ~ 5.2 の SELECT)
```


各 STEP は別 SQL ブロックに分けて出力し、ユーザーが順次実行して結果を確認できるようにする。

**注**: `consultations` テーブルは存在しない。コンサルト評価は `app/lib/consultation-evaluator.js` のルールベースで行う(Phase 2.8)。


---


# 付録 B: 過去の追加実例


## B-1: 高尿酸血症・痛風(2026-05-18 追加 + 2026-05-20 表示問題修正)


### 必要だった SQL
- diseases insert
  - 🚨 **当初 `category='metabolic'`(英語)で投入 → 表示問題発生**。後に `代謝・内分泌` に修正
  - 🚨 同名の重複行が 2 つ並列存在していた事故あり(`65cc2ea8` 空 + `dd9ce407` データあり)
- guideline_items insert(治療ガイドライン第 3 版要約)
- medications insert × 8 件
  - フェブキソスタット(フェブリク 10mg / 20mg / 40mg)
  - アロプリノール(ザイロリック 50mg / 100mg)
  - トピロキソスタット(トピロリック 20mg / 40mg / 60mg)
  - ベンズブロマロン(ユリノーム 25mg / 50mg)
  - プロベネシド(ベネシッド 250mg)
  - ドチヌラド(ユリス 0.5mg / 1mg / 2mg)
  - コルヒチン(コルヒチン 0.5mg、痛風発作予防)
  - NSAIDs(発作時頓服)
- patient_education insert:
  - purine(プリン体制限):strong / moderate / weak
  - alcohol(節酒):strong / moderate / weak
  - aerobic(有酸素運動):strong / moderate / weak
  - meal_3_regular(規則的食事):none(例外)
- model_cases insert(5 件、初級 2 / 中級 2 / 上級 1)
  - 🚨 **当初 5 件すべて `is_active=false` で投入されていた → 全部「準備中」表示**。後に UPDATE で修正


### 必要だったコード修正
- `app/api/visit2/route.js`: hasXOI、hasUricosuric の追加、uaDelta 計算式拡張
- `app/api/visit3/route.js`: 同上
- `app/cases/[id]/page.js` 他: DISEASE_LAB_MAP に追加
- UA クリアランス検査の追加(検査オーダーカタログ)
- `app/api/diseases/route.js`: `force-dynamic` 追加(PR #3、SHA `ddd8260`、2026-05-20)


### 実際に発生したバグ
1. フェブキソスタット → UA -0.1 のみ(検出 regex 完全未実装)
2. patient_education に strictness='none' 56 件混入 → 一括 SQL で削除
3. evaluate-params で lifestyle_agreements に purine カテゴリ追加忘れ → 後付け修正
4. DISEASE_LAB_MAP に「高尿酸血症・痛風」未登録 → 検査画面が膨張
5. **diseases に重複行**(`category='metabolic'`、`is_active=false` 側にデータあり、`category='代謝・内分泌'`、`is_active=true` 側は空)→ 表示不能、削除して 1 行に統合
6. **model_cases 5 件すべて `is_active=false`** → 「準備中」表示でクリック不可 → 一括 UPDATE で修正
7. **`/api/diseases` の Vercel CDN キャッシュ** → DB を直しても本番に反映されない(`age=2820`)→ `force-dynamic` で根本対処


これらは本チェックリストに従えば全て防げます。


---


# 最終確認


新疾患の追加作業を完了する前に、以下を全てチェックしてください:


- [ ] Phase 0:疾患情報文書化、難易度別モデル症例設計
- [ ] Phase 1.1:diseases に **`is_active=true`**、**`category` 日本語**、重複なしで投入
- [ ] Phase 1.2:guideline_items 投入(テーブル名注意)
- [ ] Phase 1.3-1.6:medications / medical_devices / patient_education 投入(medication カテゴリ含めて検討)
- [ ] Phase 1.7:model_cases に **`is_active=true`** で投入(忘れると 5 件全部非表示)
- [ ] Phase 2.1:DISEASE_LAB_MAP 全 3 ファイル更新
- [ ] Phase 2.1.1:exam-catalog.js に DISEASE_ITEMS・BASELINE_PANELS・DISEASE_THEMES を追加
- [ ] Phase 2.2:薬剤検出 regex 追加(visit2/visit3 両方)
- [ ] Phase 2.3:検査値計算式に薬剤効果反映、**`medicationGuidanceBonus` の式が visit2/visit3 両方にあるか**
- [ ] Phase 2.4-2.8:必要に応じて evaluate-params / feedback / auto-treatment / consultation-evaluator 更新
- [ ] Phase 2.9:Visit page 共通 UI 改修時は 3 ファイル全てに同じ変更を適用(該当時のみ)
- [ ] Phase 4.1.1:投薬・生活指導の臨床的整合性レビュー（第一選択薬・禁忌・生活指導カテゴリ・auto-treatment）
- [ ] Phase 4:Visit 1〜3 全通し動作確認
- [ ] Phase 5.1:is_active が全て true(diseases / model_cases)
- [ ] Phase 5.2:diseases の name_ja 重複なし
- [ ] Phase 5.3:薬剤効果が臨床的に妥当
- [ ] Phase 5.4:sub_options に余計な 'none' なし
- [ ] Phase 5.5:検出のみ未使用変数なし
- [ ] Phase 5.6:evaluate-params 3 箇所スキーマ一致
- [ ] Phase 5.9:Vercel CDN キャッシュが MISS(`/api/diseases`)
- [ ] Phase 5.10:3 段ループ(フロント表示 → DB 保存 → 計算反映)が全部繋がっているか
- [ ] Phase 5.11:visit2/visit3 route.jsの変数名（`disease` / `diseaseName` 混在なし、`hasXXX` 定義と使用が両方存在）
- [ ] Phase 5.12:計算式で `patient.vitals.height/weight/bmi` を直接参照していない（トップレベル参照になっている）
- [ ] Phase 5.13:patient_education の `instruction_detail` が日本語ラベルになっている（英語スラッグのままになっていない）


## ☐ 5.11 visit2/visit3 route.jsの変数名チェック（2026-05-28 新設）

```bash
# disease変数名の確認（diseaseName は NG、disease が正しい）
grep "const disease" app/api/visit2/route.js app/api/visit3/route.js
# → "const disease = caseData.disease_name" が存在すること

# 新疾患の検出変数が定義されているか
grep "const hasXXX\|hasRAS_CKD\|hasSGLT2_CKD" app/api/visit2/route.js app/api/visit3/route.js
# → 定義行と使用行の両方が存在すること
```

## ☐ 5.12 patient_data の参照パスチェック（2026-05-28 新設）

`height`・`weight`・`bmi` は `patient_data` のトップレベルに格納されている（`vitals` の中ではない）。
新疾患追加時に計算式で使う場合は `patient.height || patient.vitals?.height` 形式で参照すること。

```bash
# vitals.height/weight/bmi を直接参照している箇所がないか確認
grep "patient\.vitals\.height\|patient\.vitals\.weight\|patient\.vitals\.bmi"   app/api/visit2/route.js app/api/visit3/route.js
# → 0件であること（あれば修正必要）
```

## ☐ 5.13 patient_education の instruction_detail が日本語になっているか（2026-05-28 新設）

```sql
SELECT instruction_key, instruction_detail
FROM patient_education WHERE disease_id = '<disease_id>';
-- instruction_detail が日本語の短いラベルになっていること
-- 英語スラッグ（ckd_salt等）のままになっていたらUPDATEで修正
```

**全てチェック ✅ で完了**。一つでも未確認なら、その箇所から発生するバグの再発リスクが残ります。
