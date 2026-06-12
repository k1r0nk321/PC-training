# PC-training 設計書・仕様書


> このファイルは Claude Project Knowledge にアップロードしてください。Claude が回答時に参照します。
> 関連文書:
> - PC-training_プロジェクト指示.md(Custom Instructions 用)
> - PC-training_新疾患追加チェックリスト.md(新疾患追加時必読)


> **改訂履歴**
> - 2026-05-20: 高尿酸血症表示不具合の調査でスキーマ実態とのズレが多数発覚。第 3 章のテーブル名・列名を実 DB に合わせて全面改訂。`model_cases` テーブルを正式に記述。第 11 章に Vercel CDN キャッシュ罠を追記。
> - 2026-05-21 (午前): 服薬指導 → adherence bonus(`medicationGuidanceBonus`)実装に伴い第 3.10/5.1/5.4 節を更新。コンサルト UI 全面リファクタリング(フォーム+カードパターン)実装に伴い第 11.9/11.10/11.11 節を追加。新規 第 13 章「ブラウザ MCP 経由作業のノウハウ」を追加。
> - 2026-05-21 (午後): 評価システム全体設計策定
> - 2026-05-28: CKD疾患追加（PR #7）。patient_dataトップレベル参照の鉄則・route.js変数名規則・instruction_detail日本語化を第3・5・11章に追記。・`guideline_rules` テーブル新設・治療方針指導医アドバイス機能実装(PR #6)に伴い第 3.11/3.12 節・第 8.3 節・第 11.12/11.13 節・第 15 章を追加。API モデル名トラブル・PR コンフリクト解消の知見を第 12.5 節に追記。


---


## 第 1 章 システム概要


### 1.1 アプリ概要


**PC-training**(プライマリケア・トレーニング)は、医仁会 竹田総合病院の中前医師(総合診療/救急医、臨床研修指導医)が個人開発している、研修医・医学生向け外来診療シミュレーターである。


### 1.2 シミュレーション構造


ユーザー(研修医/学習者)は、患者(AI)に対して以下を 3 つの Visit(初診 → 1 ヶ月後 → 2-3 ヶ月後)にわたって行う:


1. **問診**(messages の往復、AI が患者役として応答)
2. **診察・検査オーダー**(ExamOrderModal)
3. **治療方針決定**(投薬、医療機器、専門医コンサルト、生活指導、患者教育)
4. **次回 Visit へ進む**(検査結果が改善 / 悪化を AI 算出)
5. **フィードバック**(Visit 2 後、Visit 3 後)


### 1.3 主要モード


| モード | 説明 | 対象 |
|---|---|---|
| 通常モード | 研修医本人が治療選択 | 研修医、専攻医、指導医 |
| 担当医任せモード(学習者) | 治療選択は自動、生活指導/患者教育のみユーザーが行う | 医学生、医療従事者(看護師等)、デモ非医師 |
| 細かいコーチング | 問診中、毎ターン指導医 AI がコメント | 全モード |


### 1.4 デモ機能


- ログインなしで `signInAnonymously()` で 3 症例まで体験可能
- デモ利用者は身分(医師/学習者)を選択可能(localStorage 保存)


---


## 第 2 章 技術スタック


### 2.1 構成要素


| 領域 | 技術 | 用途 |
|---|---|---|
| フレームワーク | Next.js 14.1.0 (App Router) | SSR / API Routes |
| 言語 | JavaScript (.js) | TypeScript 未使用 |
| ホスティング | Vercel | 自動 CI/CD |
| DB / Auth | Supabase (Postgres + Auth) | データ永続化、匿名/メール認証 |
| AI モデル(高度) | `claude-sonnet-4-6` | フィードバック評価、症例生成、AI 患者応答 |
| AI モデル(軽量) | `claude-haiku-4-5-20251001` | パラメータ評価、コーチング |
| ブラウザ拡張 | Claude in Chrome MCP | 開発代行(GitHub UI 操作) |


### 2.2 Anthropic API ラッパー


`app/lib/claude-client.js` の `claudeCreate({ model, max_tokens, messages })` を使用。
直接 `new Anthropic()` を使う箇所もあるが、原則ラッパー経由。


### 2.3 ブランチ運用


- `main`: 本番(保護、PR + Anthropic API 動作確認後マージ)
- `develop`: 開発(直接 commit OK、Vercel preview URL 自動生成)
- preview URL: `https://pc-training-git-develop-k1r0nk321.vercel.app/`
- production URL: `https://pc-training.vercel.app/`


**Branch protection**: main は `merge commit を含めない` + `1 approval 必須` ルールが設定されている。実運用では `Squash and merge + bypass rules` でユーザー自身がバイパスマージすることが多い。


---


## 第 3 章 データモデル(Supabase)


> 🚨 **重要**: 本章のテーブル名・列名は 2026-05-20 時点の実 DB に基づく。設計書記載と実 DB が乖離した場合は **実 DB を正**とし、本章を更新する運用。


### 3.1 主要テーブル一覧


| テーブル | 主用途 | 主キー |
|---|---|---|
| `auth.users` | Supabase 標準認証 | id (UUID) |
| `user_profiles` | ユーザー身分・表示名 | user_id (UUID) |
| `diseases` | 疾患マスタ | id (UUID) |
| `cases` | ユーザーが開始した症例(初期データ + visit2/3 生成データ含む) | id (UUID) |
| `model_cases` | 疾患別のモデル症例(教材) | id (UUID) |
| `visit_parameters` | 各 Visit のパラメータ進行状態 | (case_id, visit_number) |
| `patient_education` | 疾患別の生活指導・患者教育選択肢 | (disease_id, 行 id) |
| `medications` | 疾患別の薬剤候補 | (disease_id, 行 id) |
| `medical_devices` | 疾患別の医療機器候補 | (disease_id, 行 id) |
| `guideline_items` | 疾患別ガイドライン要約(プロンプト埋込用) | (disease_id, 行 id) |
| `results` | 完了済み症例の結果 | id |
| `announcements` | サービス内お知らせ | id |
| `app_settings` | グローバル設定 | (key) |


**注:** 過去版設計書に記載されていた `guidelines` / `consultations` テーブルは**実在しない**。
- ガイドライン:`guideline_items` テーブル
- 専門医コンサルトの適切性評価:DB ではなく `app/lib/consultation-evaluator.js` のルールベース判定で扱う


### 3.2 user_profiles


```
- user_id: UUID (FK to auth.users)
- position: string (例: '指導医', '専攻医', '研修医', '医学生', '医療従事者', 'その他', '学習者')
- real_name: string
- handle_name: string
- display_preference: 'real_name' | 'handle_name'
```


非医師身分(医学生、医療従事者、その他、学習者)はリスト `NON_PHYSICIAN_POSITIONS` で判定し、「担当医任せ」ボタン表示/学習者モード適用に使う。


### 3.3 diseases


```
- id: UUID
- name_ja: string (例: '2型糖尿病', '高血圧症', '脂質異常症', '高尿酸血症・痛風')
- name_en: string
- icd10_code: string (例: 'E11', 'I10', 'M10') - nullable
- category: string (例: '代謝・内分泌', '循環器', '呼吸器', '消化器', '精神・神経', '筋骨格', '腎・泌尿器', '皮膚', '予防医学')
- subcategory: string (例: '慢性疾患管理', '感染症', '機能性疾患')
- difficulty_level: int (1=初級, 2=中級, 3=上級)
- is_active: boolean (true=公開, false=準備中/非表示)
- sort_order: int
- created_at, updated_at
```


🚨 **重要ルール**:
- `is_active` 列名に注意(過去版設計書の `hidden` は誤り)。**`is_active=true` で表示、`false` で非表示**。
- `category` は **日本語表記で既存疾患と揃える**(例:`代謝・内分泌`)。英語表記(`metabolic` 等)で投入するとフロントのカテゴリタブで弾かれて準備中表示になる。
- 同名 (`name_ja`) の重複行を作らないよう注意(過去に高尿酸血症で 2 行が並列存在し、データのある側が `is_active=false`、空の側が `is_active=true` という事故があった)。


現在実装済み疾患: 2型糖尿病、高血圧症、脂質異常症、高尿酸血症・痛風(2026-05-18 追加)
DB には他に多数の疾患マスタ行(慢性心不全、心房細動、甲状腺機能低下症、気管支喘息、COPD など計 20 件)が存在するが、これらは `is_active=true` ながら model_cases や medications が未投入のため、フロントで「準備中」表示。今後の実装候補。


### 3.4 cases(ユーザーセッション)


ユーザーが「症例を開始する」を押した時点で 1 行が作られる。モデル症例選択でもランダム生成でも、ここに行が作られる。


```
- id: UUID
- disease_id: UUID
- user_id: UUID (null 可、デモ匿名ユーザーは null)
- patient_data: jsonb (詳細は 3.6)
- scenario_data: jsonb (詳細は 3.7)
- visit2_data: jsonb (Visit 2 で生成された vitals/labs/opening comment 等)
- visit3_data: jsonb
- saved_state: jsonb (中断時の current_visit / step 等)
- is_model_case: boolean (※ 実運用上は使われていない。後述)
- created_at, updated_at
```


**注:** 過去版設計書では `cases.is_model_case=true` でモデル症例を管理する旨を記載していたが、**実際のモデル症例は別テーブル `model_cases` に格納されている**(第 3.5 節)。`cases.is_model_case` 列は残存しているが現状アクティブには使われていない(`true` で投入されることはない)。


### 3.5 model_cases(モデル症例マスタ)


疾患別の教材症例。`/api/model-cases` が読み、`is_active=true` のものだけ返却。


```
- id: UUID
- disease_id: UUID (FK to diseases)
- disease_name: string (冗長保持。例: '高尿酸血症・痛風')
- title: string (例: '50代男性 健診で UA 高値')
- description: string (1〜2行の要約)
- patient_data: jsonb (3.6 と同構造)
- scenario_data: jsonb (3.7 と同構造)
- sort_order: int (難易度順表示に使用、通常 1〜5)
- is_active: boolean (true=表示、false=非表示)
- created_at, updated_at
```


🚨 **重要ルール**:
- 新疾患追加時、`is_active=true` で投入すること。デフォルト値が `false` のため、明示しないと全 model_cases が非表示になる(2026-05-20 の高尿酸血症事故の根本原因)。
- `disease_name` 列は冗長保持なので、`diseases.name_ja` と必ず一致させる。
- `sort_order` は同一 `disease_id` 内でユニークになるよう設計(難易度初級→上級の順に 1〜5 を割り当てるのが慣例)。


症例選択画面 (`/cases`) では、`/api/diseases` の各疾患の `case_count` がモデル症例件数を表示し、`case_count > 0` の疾患だけがクリック可能 (`✓ N症例` バッジ表示)。 `case_count === 0` の疾患は `📋 準備中` 表示でクリック不可。


### 3.6 patient_data jsonb 構造

🚨 **重要（2026-05-28 追記）**: `height`・`weight`・`bmi` は `vitals` の中ではなく**`patient` 直下のトップレベル**に格納されている。
計算式・JSX 表示では必ず `patient.height || patient.vitals?.height` 形式で参照すること。
`patient.vitals.height` は `undefined` になりゼロ除算・表示空欄などのバグに直結する。


cases と model_cases で共通。


```json
{
  "name": "山田 太郎",
  "age": 58,
  "gender": "男性",
  "occupation": "会社員(営業職)",
  "bmi": 28.5,
  "height": 170,
  "weight": 82.3,
  "vitals": {
    "bp": "158/96 mmHg",
    "hr": "78 /min",
    "spo2": "98%",
    "bt": "36.5℃",
    "rr": "16 /min"
  },
  "labs": {
    "ldl": 165, "hdl": 38, "tg": 280, "total_cholesterol": 245,
    "non_hdl_c": 207, "hba1c": 7.8, "glucose": 168,
    "ua": 8.2, "ast": 38, "alt": 45, "ck": 120,
    "cr": 0.95, "egfr": 68, "na": 140, "k": 4.1, "urine_alb": 25,
    "bnp": null
  },
  "history": "5年前から健診で血糖値高値を指摘されていた...",
  "chief_complaint": "健診で 2型糖尿病を指摘",
  "current_medications": [
    { "name": "アムロジピン", "dose": "5mg 1錠 朝食後" }
  ],
  "social_history": "...",
  "family_history": "...",
  "allergies": [],
  "hidden_params": {
    "personality_type": "anxious",
    "adherence_level": 0.6,
    "eating_habit_label": "外食が多い",
    "eating_habit_comment": "週に3-4回",
    "exercise_habit_label": "ほぼ運動しない",
    "exercise_habit_comment": "",
    "smoking_status": "current",
    "smoking_pack_year": 30,
    "drinking_amount": "ビール 500ml 毎日"
  }
}
```


### 3.7 scenario_data jsonb 構造


```json
{
  "difficulty": 1,  // 1=初級, 2=中級, 3=上級
  "key_points": ["..."],
  "expected_diagnosis": "...",
  "expected_medications": ["..."],
  "expected_lifestyle_guidance": ["減塩", "減量", "禁煙", "節酒", "運動"]
}
```


### 3.8 visit_parameters


`(case_id, visit_number)` 複合キー。Visit 中の患者特性パラメータ進行状態。


```
- case_id: UUID
- visit_number: 1 | 2 | 3
- personality: string (例: '楽観的', '心配性', '頑固', 'ルーズ', '短気')
- eating_habit_label: string
- eating_habit_comment: string
- exercise_habit_label: string
- exercise_habit_comment: string
- stress: int (0-5)
- busyness: int (0-5)
- lifestyle_motivation: int (0-5)        # 生活改善意欲 ★
- medication_motivation: int (0-5)        # 服薬意欲 ★
- trust_level: int (0-5)                  # 医師への信頼度 ★
- initial_lifestyle_motivation: int       # Visit 開始時の値(進行幅の起点)
- initial_medication_motivation: int
- initial_trust_level: int
- smoking_label: string                   # 例: '喫煙(20本/日)', '禁煙挑戦中', '禁煙'
- smoking_comment: string
- smoking_intervention: string | null
- drinking_label: string
- drinking_comment: string
- drinking_intervention: string | null
- lifestyle_agreements: jsonb             # 詳細は 3.9
- pending_treatment_changes: jsonb        # 治療反映待ち変更(stress/busyness/diet_treatment 等)
- created_at, updated_at
```


### 3.9 lifestyle_agreements jsonb 構造


問診中に患者が同意した生活変容を記録する。


```json
{
  "diet":       { "agreed": true,  "level": "moderate", "detail": "1日2000kcal", "category": "diet" },
  "exercise":   { "agreed": true,  "level": "weak",     "detail": "週2回散歩30分" },
  "smoking":    { "agreed": false, "level": null,       "detail": null },
  "drinking":   { "agreed": true,  "level": "strong",   "detail": "完全休肝日 週2日" },
  "weight":     { "agreed": true,  "level": "moderate", "detail": "3kg減" },
  "monitoring": { "agreed": true,  "level": "weak",     "detail": "週1回測定" }
}
```


カテゴリ: `diet`、`exercise`、`smoking`、`drinking`、`weight`、`monitoring`
レベル: `weak`、`moderate`、`strong`(strong ほど厳格な合意)


evaluate-params API で発話内容から AI が抽出し、より厳しい合意で上書き(mergedAgreements ロジック)。


### 3.10 patient_education


疾患別の生活指導・患者教育の選択肢マスタ。


```
- id
- disease_id: UUID
- category: 'salt' | 'calorie' | 'eating_out' | 'night_eating' | 'alcohol' | 'aerobic' | 'resistance' | 'meal_3_regular' | 'continue_basal' | 'eating_out_guide' | 'purine' | ...
- sub_options: jsonb 配列
```


`sub_options` の各要素:
```json
{
  "id": "salt_strict",
  "label": "塩分 6g/日 未満厳守",
  "category": "salt",
  "strictness": "strong",  // 'weak' | 'moderate' | 'strong'
  "description": "ハム・かまぼこなど加工食品も含めて..."
}
```


🚨 **重要ルール（2026-05-28 追記）**: `instruction_detail` フィールドが UI 上のメニュー見出しラベルとして表示される。
DB 投入時に**短い日本語ラベル**（例: `減塩指導（目標3〜6g/日）`）を設定すること。
英語スラッグ（`ckd_salt` 等）のままにすると UI が英語表記になる。

**重要ルール**: `strictness: 'none'` の選択肢は原則登録しない(UI 上で「無効」表示になる)。
例外: 「規則的に 1 日 3 食」「基礎インスリン継続(DKA 予防)」「外食メニュー選択指導」のような、強度設定不要な汎用指導は `strictness: 'none'` を許可。


**🆕 medication カテゴリの特殊な効果(2026-05-21)**:
`category: 'medication'` の sub_options(お薬カレンダー、家族見守り、副作用説明、習慣紐付け等の服薬指導)は、選択数に応じて `visit2/route.js` と `visit3/route.js` で `effectiveAdherence` に**最大 +0.20 の bonus** を加算する(第 5.4 節参照)。
- 計算式: `medicationGuidanceBonus = Math.min(0.20, medicationSubs.length * 0.05)`
- 4 個以上選択で上限到達(各 +0.05)
- この仕組みにより「服薬指導が薬効に反映される」教育的なフィードバックループが成立


他のカテゴリ(diet/exercise/salt/alcohol 等)は `consentedSubs` 経由で `lifestyleEffect`(saltEffect、totalLifestyleEffect)に反映される。medication カテゴリだけが adherenceFactor 経路で全 delta をスケーリングする点に注意。


---


## 第 4 章 主要 API ルートと責務


### 4.1 API ルート一覧


| ルート | メソッド | 責務 |
|---|---|---|
| `/api/cases` | POST | 症例(ランダム/モデル選択)の新規作成、is_demo 制限 |
| `/api/diseases` | GET | 疾患マスタ + model_cases 件数集計を返却(force-dynamic、第 11.8 節参照) |
| `/api/model-cases` | GET | 疾患別モデル症例一覧取得、demo 制限。`is_active=true` のみ返す |
| `/api/retry-case` | POST | 完了済み症例の再挑戦 |
| `/api/visit2` | POST | Visit 2 のバイタル・検査値・患者開頭挨拶を生成(冪等) |
| `/api/visit3` | POST | Visit 3 同上(Visit 2 を baseline) |
| `/api/visit-parameters` | GET/POST/PATCH | visit_parameters の取得・初期化・部分更新 |
| `/api/evaluate-params` | POST | 問診直近の発話から患者パラメータ変動を算出 |
| `/api/patient-reaction` | POST | 治療/指導/コンサルト選択時の患者反応生成 |
| `/api/feedback` | POST | Visit 2 完了時の総合フィードバック生成 |
| `/api/visit3-feedback` | POST | Visit 3 完了時の総合フィードバック生成 |
| `/api/preceptor-coaching` | POST | 細かいモードの問診毎ターン指導医コメント + 問診終了推奨判定(2026-05-19 拡張) |
| `/api/auto-treatment` | POST | 担当医任せモード:自動治療選択 |
| `/api/ai` | POST | 患者(AI)応答生成 (chat)、turnCount ≥16 で問診継続拒否注入(2026-05-19 拡張) |
| `/api/exam-orders` | POST | 検査オーダー結果生成 |
| `/api/referral-letter` | POST | 紹介状(田村医師名義) |
| `/api/user-progress` | GET | ランク、完了数、デモ残数 |
| `/api/user-profile` | GET/POST | user_profiles 操作 |


### 4.2 Visit 1 → 2 → 3 のデータフロー


```
[症例作成]
  ↓ POST /api/cases
[cases テーブルに insert]
  ↓
[Visit 1 開始]
  /cases/[id]
  ↓
  GET /api/visit-parameters?caseId&visit=1 (初期化 or 取得)
  ↓
  問診開始
    ├ 毎ターン: POST /api/ai (患者応答)
    └ 毎ターン: POST /api/evaluate-params (patient特性更新)
    └ 細かいモード: POST /api/preceptor-coaching (コーチング)
  ↓
  検査オーダー: POST /api/exam-orders
  ↓
  治療方針決定:
    ├ POST /api/patient-reaction (各治療項目への反応)
    └ POST /api/auto-treatment (担当医任せの場合)
  ↓
  [Visit 2 へ進む] → saved_state.current_visit = 2


[Visit 2 開始]
  /cases/[id]/visit2
  ↓
  POST /api/visit2 (visit2Vitals, visit2Labs, opening comment 生成)
    └ baseline = patient.labs
    └ 4週間後の効果を adherence と薬剤効果で算出
  ↓
  PatientInfoCard で V1 ↔ V2 の検査値比較表示
  ↓
  GET /api/visit-parameters?caseId&visit=2 (初期化)
    └ Visit 1 の最終値を引き継ぎ + progressSmokingLabel / progressDrinkingLabel 適用
  ↓
  同様に問診・検査・治療
  ↓
  POST /api/feedback (Visit 2 までの総合評価)


[Visit 3 開始]
  /cases/[id]/visit3
  ↓
  POST /api/visit3 (baseline = visit2Labs)
  ↓
  ...同様...
  ↓
  POST /api/visit3-feedback (Visit 1〜3 通算評価)
```


### 4.3 冪等化(同じ Visit を何度開いても同じ値)


`/api/visit2` と `/api/visit3` は最初の呼び出しで生成した値を `caseData.visit2_data` / `visit3_data` に保存する。2 回目以降は保存済みの値を返す(cached: true)。


---


## 第 5 章 検査値計算ロジック(visit2/route.js)


### 5.0 patient_data の参照パスの鉄則（2026-05-28 追記）

🚨 `patient_data` のフィールド配置を誤認すると計算値がゼロ・`undefined` になる。

| フィールド | 正しいパス | 誤ったパス（undefined） |
|---|---|---|
| 身長 | `patient.height` | `patient.vitals.height` ❌ |
| 体重 | `patient.weight` | `patient.vitals.weight` ❌ |
| BMI | `patient.bmi` | `patient.vitals.bmi` ❌ |
| 血圧 | `patient.vitals.bp` | — |
| 検査値 | `patient.labs.egfr` 等 | — |

**推奨記法**: `parseFloat(patient.height || patient.vitals?.height)` — 両方のパスをフォールバックとして持たせると安全。

### 5.1 計算の流れ


1. `consentedMeds` = 同意された薬剤リスト(`isConsentedItem` で判定)
2. `consentedSubs` = 同意された生活指導 sub_options
3. 各種 `hasXxx` 検出フラグ(regex 一致)を生成
4. lifestyleBadness、effectiveAdherence、saltEffect、lifestyleEffect、totalLifestyleEffect 算出
   - **🆕 `medicationGuidanceBonus`**: `consentedSubs` のうち `category === 'medication'` の数 × 0.05(上限 +0.20)を `effectiveAdherence` に加算
5. 各検査値の delta 計算 → baseline + delta = visit2Labs


🚨 **新指導カテゴリ追加時の鉄則**: patient_education に sub_options を増やすだけでは効果が出ない。**必ず visit2/route.js + visit3/route.js の計算式まで配線する**こと(第 11.9 節「ループ閉じ忘れ」パターン参照)。


### 5.2 acceptance_level


患者の同意状態:`'accepted'`(承諾)、`'persuaded'`(説得後承諾)、`'rejected'`(拒否)。
過去のバグ:`acceptance_level` が undefined だと `isConsentedItem` が false を返し、薬が効かない問題があった。
学習者モード(担当医任せ)では `acceptance_level: 'accepted'` を明示的に入れる必要がある。


### 5.3 薬剤検出パターン(2026-05-19 時点、最新)


`consentedMedNames` = `drug_name_generic + '|' + drug_name_brand + '|' + medication_class` の連結文字列に対する正規表現一致。**この検出パターンは `visit2/route.js` と `visit3/route.js` の両方に同一内容で実装が必要**(2026-05-19 に visit3 側で 9 個の regex が欠落しているバグを修正、コミット `2b1b5532`、`5832eb71`)。visit3 では変数名が `v3MedNames` であることに注意。


```javascript
const hasDiuretic     = /thiazide|diuretic|フロセミド|ヒドロクロロチアジド|スピロノラクトン|トリクロル|インダパミド|利尿/.test(s)
const hasARB_ACE      = /ARB|ACE|RAS|バルサルタン|オルメサルタン|アジルサルタン|テルミサルタン|ロサルタン|カンデサルタン|イルベサルタン|エナラプリル|ペリンドプリル/.test(s)
const hasStatin       = /スタチン|statin|ロスバスタチン|アトルバスタチン|プラバスタチン|ピタバスタチン|シンバスタチン/.test(s)
const hasEzetimibe    = /エゼチミブ|ゼチーア/.test(s)
const hasFibrate      = /フィブラート|フェノフィブラート|ベザフィブラート/.test(s)
const hasMetformin    = /メトホルミン/.test(s)
const hasSGLT2        = /エンパグリフロジン|ダパグリフロジン|カナグリフロジン|イプラグリフロジン|トホグリフロジン|SGLT2/.test(s)
const hasGLP1         = /セマグルチド|デュラグルチド|リラグルチド|オゼンピック|リベルサス|マンジャロ|チルゼパチド|GLP/.test(s)
const hasDPP4         = /シタグリプチン|リナグリプチン|テネリグリプチン|ビルダグリプチン|アログリプチン|アナグリプチン|オマリグリプチン/.test(s)
const hasSU           = /グリメピリド|グリクラジド|グリベンクラミド/.test(s)
const hasInsulin      = /インスリン|グラルギン|デグルデク|トレシーバ|アスパルト|リスプロ/.test(s)
const hasGLP1Dulaglutide = /デュラグルチド|トルリシティ/.test(s)
const hasXOI          = /フェブキソスタット|フェブリク|フェブリック|アロプリノール|ザイロリック|サロベール|トピロキソスタット|トピロリック/.test(s)
const hasUricosuric   = /プロベネシド|ベネシッド|ベンズブロマロン|ユリノーム|ドチヌラド|ユリス/.test(s)
const hasTZD          = /ピオグリタゾン|アクトス/.test(s)
const hasAGI          = /アカルボース|グルコバイ|ボグリボース|ベイスン|ミグリトール|セイブル/.test(s)
const hasGlinide      = /ナテグリニド|スターシス|ファスティック|レパグリニド|シュアポスト|ミチグリニド|グルファスト/.test(s)
const hasPCSK9        = /エボロクマブ|レパーサ|アリロクマブ|プラルエント|PCSK9/.test(s)
const hasEPA          = /イコサペント酸|エパデール|ロトリガ|エイコサペンタエン|オメガ3|オメガ-3/.test(s)
```


### 5.4 検査値 delta 計算式(adherenceFactor 倍前)


```javascript
// ===== effectiveAdherence 算出(2026-05-21 更新)=====
const baseAdherence = { high: 0.85, medium: 0.6, low: 0.35 }[hidden.adherence_level] || 0.6

// 既存: 患者同意率による動機付け
//   visit2: 0.7+→0.2、0.5+→0.1、それ以下→0
//   visit3: 0.7+→0.25、0.5+→0.15、それ以下→0.05(継続効果で高め)
const motivationBoost = ...persuasionSuccessRate に応じた値...

// 🆕 服薬指導 sub_options による bonus(最大 +0.20)
const medicationSubs = consentedSubs.filter(s => s.category === 'medication')
const medicationGuidanceBonus = Math.min(0.20, medicationSubs.length * 0.05)

// 過剰介入ペナルティ
const overloadPenalty = Math.max(0, (interventionCount - 3) * resistanceLevel * 0.15)

const effectiveAdherence = Math.min(1.0, Math.max(0.1,
  baseAdherence + motivationBoost + medicationGuidanceBonus - overloadPenalty
))

adherenceFactor = max(0.5, min(1.0, effectiveAdherence || 0.7))  // 0.5〜1.0


// 体重減少
weightReduction = lifestyleWeightReduction + drugWeightLoss  // SGLT2/GLP1 系で 3-7% 減


// 血圧(高血圧症)
medEffect = hasMedication ? (10〜17 random) : 0
totalBpReduction = round((medEffect + totalLifestyleEffect) * (0.85 + random*0.3))
systolic2 = max(115, systolic1 - totalBpReduction + random)
diastolic2 = max(68, diastolic1 - round(totalBpReduction * 0.5) + random)


// HbA1c (糖尿病)
weightEffH = -(wKg * 0.20)
lifestyleEffH = -min(lifestyleFactor * 1.0, 0.5)
oralCount = [hasMetformin, hasDPP4, hasSU, hasTZD, hasAGI, hasGlinide].filter(Boolean).length
oralEff = 
  oralCount >= 1: -0.7
  oralCount >= 2: -0.7 -0.6 = -1.3
  oralCount >= 3: -0.7 -0.6 -0.5 = -1.8 (cap)
dulaEff = hasGLP1Dulaglutide ? -0.6 : 0  // デュラグルチドのみ直接効果(他GLP1は体重経由)
insulinEff = hasInsulin ? -1.0 : 0
hba1cDelta = (weightEffH + lifestyleEffH + oralEff + dulaEff + insulinEff) * adherenceFactor
glucoseDelta = hba1cDelta * 30


// HDL
hdlDelta = (wKg * 0.3 + lifestyleFactor * 3 + (hasStatin ? 2 : 0) + (hasFibrate ? 3 : 0)) * adherenceFactor


// TG
if (baseTG > 0 && baseTG < 150):
  tgDelta = -(wKg * 4 + lifestyleFactor * 15)
  if hasFibrate: tgDelta -= baseTG * 0.30
  if hasStatin:  tgDelta -= baseTG * 0.10
  if hasEPA:     tgDelta -= baseTG * 0.20
  newTG = baseTG + tgDelta * adherenceFactor
elif baseTG >= 150:
  tgPct = (wKg * 0.04 + lifestyleFactor * 0.10 +
           (hasFibrate ? 0.30 : 0) + (hasStatin ? 0.10 : 0) + (hasEPA ? 0.20 : 0)) * adherenceFactor
  newTG = baseTG * (1 - tgPct)


// LDL
ldlDelta = -(wKg * 1.5 + lifestyleFactor * 5)
if hasStatin:    ldlDelta -= baseLDL * 0.35  // -35%
if hasEzetimibe: ldlDelta -= baseLDL * 0.18  // -18%
if hasPCSK9:     ldlDelta -= baseLDL * 0.50  // -50%
ldlDelta *= adherenceFactor


// UA (尿酸)
uaDelta = -(wKg * 0.05 + lifestyleFactor * 0.2
            + (hasSGLT2 ? 0.3 : 0)
            + (hasXOI ? 2.5 : 0)        # フェブキソスタット等で大幅減
            + (hasUricosuric ? 1.7 : 0)) # ベンズブロマロン等で中等度減
            + (hasDiuretic ? 0.5 : 0)    # 利尿薬で増加
uaDelta *= adherenceFactor


// 副次的な値
total_cholesterol = baseTC + ldlDelta * 0.7
non_hdl_c         = baseNonHdlC + ldlDelta * 0.9
HDL の上下で HDL も調整
AST/ALT は条件付きで微変動(V1-20 cumulative cap)
```


### 5.5 設計判断と注意


- GLP-1(セマグルチド、リラグルチド)は HbA1c 直接効果を**意図的に省略**し、体重減少経由のみとしている(2026-05-19 時点)。将来 -0.6〜-1.0 の直接効果追加検討余地あり。
- TZD/α-GI/グリニドは oralCount にカウント(独立効果として加算しない)
- フィブラートは LDL に直接効果は加算していない(主に TG/HDL 用途)
- 利尿薬の BP 効果は包括 medEffect(10-17 mmHg)で吸収、個別効果分離していない


---


## 第 6 章 患者特性パラメータ評価(evaluate-params API)


### 6.1 責務


問診中、研修医と患者の対話内容を AI(haiku-4-5)に渡し、以下を判定:


- eating_habit_label/comment、exercise_habit_label/comment
- smoking_label/comment、drinking_label/comment(2026-05-19 即時更新対応)
- lifestyle_motivation の delta(-1 / 0 / +1)
- medication_motivation の delta
- trust_level の delta
- lifestyle_agreements の追加・上書き
- reasoning(評価理由のテキスト、ログ用)


### 6.2 重要ルール


- **身分動的化(speakerLabel)の実装状況**(2026-05-19 時点):
  - `patient-reaction/route.js`:実装済み(`userPosition` を受け取り「先生」/「学習者」を切替)
  - `preceptor-coaching/route.js`:実装済み(2026-05-19 追加、`userPosition` から「研修医」/「学習者」を切替)
  - `ai/route.js`、`evaluate-params/route.js`:**未実装**(将来の改修対象)
  - 各 visit page の患者プロンプトでは `userDisplayName`(handle_name または real_name) + `isNonPhysicianRole(userPosition)` で「{表示名}さん」呼びかけ済み
- `personality` は visitParams にあるが、AI には渡さない(指導医コーチングと同様)
- AI 出力 JSON スキーマ、newParams、プロンプト例(rule B)の 3 箇所のフィールド名は必ず一致させること
- `userPosition` 未取得時の ReferenceError → API 500 → silent fallback で全パラメータ更新停止する致命的バグ実績あり(cf88447 が安全リビジョン)


### 6.3 mergedAgreements ロジック


- 既存合意と新規合意の category が一致する場合:
  - level が高い方を採用(strong > moderate > weak)
  - 同 level で detail に数値制限がある場合、より厳しい方を採用(extractNumericLimit、isStricterDetail)


---


## 第 7 章 指導医コーチング(preceptor-coaching API)


### 7.1 責務


細かいモードで毎ターン、研修医の発言と患者反応に対して上級指導医 AI(sonnet-4-6)がコメント。


### 7.2 入力(2026-05-19 時点)


- diseaseName、recentMessages、doctorMessage、patientResponse、visitNumber
- patientParams: visitParams 全体(personality は API 内で除外して使用)


### 7.3 内部処理


- `buildPatientContext(params)` で患者特性ブロック構築
  - eating/exercise/smoking/drinking ラベル
  - lifestyle_motivation、medication_motivation、trust_level(★/☆)
  - lifestyle_agreements で `agreed: true` の項目を要約
- プロンプトに患者特性コンテキストとして挿入
- ルール:
  - 患者特性に既に記載されている情報(喫煙歴・飲酒量など)を再確認するよう促さない
  - 患者個別の状況に応じた具体アドバイス
  - 研修医の対話戦略を尊重(先回りせず方向性を強化)


### 7.4 personality を渡さない理由


personality は visitParams にも patient_data.hidden_params にも存在するが、これを AI に直接渡すと AI が「あなたの心配性な性格を考えると...」のような過剰メタコメントをするリスクがあり、教育的でないため除外。


### 7.5 問診終了推奨機能(2026-05-19 追加)


問診の終わりどころを学習者に伝えるため、preceptor-coaching API のレスポンスに `endRecommendation` フィールドを追加。**細かいモード(`coachingMode === 'detailed'`)のときのみ**評価される。


#### トリガー(優先度順)


| 優先度 | kind | 条件 | 表示 |
|---|---|---|---|
| 1(Visit 1 限定、一度のみ) | `paramReady` | `trust_level >= initial_trust_level + 2` かつ `lifestyle_agreements.diet.level in ['moderate','strong']` かつ `lifestyle_agreements.exercise.level in ['moderate','strong']` | 「患者さんとの信頼関係も築けて、生活面でも具体的な合意が取れていますね。…」 |
| 2 | `refuse` | `doctorTurnCount >= 16` | 「診察時間が長くなっていますね。…これ以上の問診継続は患者さんの負担になります…」 |
| 3(一度のみ) | `turn15` | `doctorTurnCount === 15` | 「患者さんから多くの情報が得られましたね。…次のステップへ進みましょう。」 |
| 4(一度のみ) | `turn10` | `doctorTurnCount === 10` | 「問診が充実してきましたね。…そろそろ具体的な治療内容について話し合い、治療方針の決定に進むことも検討してみてください。」 |


#### 入力


- `doctorTurnCount`:研修医/学習者の送信回数(`messages.filter(m => m.role === 'user').length + 1`)
- `endRecommendationShown`:`{ paramReady, turn10, turn15 }` の bool フラグ(クライアント側 useState で管理、DB 永続化なし)


#### state 管理


visit page 側で `useState({ paramReady: false, turn10: false, turn15: false })`。一度表示したらフラグを立て、再表示を抑止。ページリロードでリセットされる(意図的)。


#### 患者拒否(ai/route.js 連携)


`/api/ai` 呼び出しに `turnCount` を渡し、≥16 のときに system prompt 末尾に「これ以上の問診継続を丁寧に断ってください」という指示を注入。患者役 AI が「もう十分お話ししました」「治療の話に進みましょう」と応答するようになる。


### 7.6 呼称機能(speakerLabel)


preceptor-coaching の AI プロンプト内で、研修医を指す表現を身分に応じて切り替える。


- `userPosition` が `NON_PHYSICIAN_POSITIONS`(医学生、医療従事者、その他、学習者)に該当 → `speakerLabel = '学習者'`
- それ以外(指導医、専攻医、研修医) → `speakerLabel = '研修医'`


この speakerLabel は AI プロンプトの「[研修医/学習者]: メッセージ」というラベル付け、および「[研修医/学習者]の質問を肯定的に評価する」といった指示文に反映される。


**終了推奨メッセージ本体には呼称を含めない方針**(2026-05-19 仕様確定)。「先生」「学習者さん」のような呼びかけはメッセージ末尾には付加しない。


### 7.7 初期コーチングモード


全 visit page の `useState('detailed')` で**初期値「細かく」モード**に設定(2026-05-19 変更、旧値は `'recommended_only'`)。新規ユーザーは初回から指導医コメントが毎ターン表示される。既存ユーザーで `user_preferences.preceptor_coaching_mode` を保存済みの場合はそちらが優先される。


---


## 第 8 章 専門医コンサルト評価(consultation-evaluator.js)


### 8.1 ルールベース判定


`buildConsultationEvaluationBlock(diseaseName, patientData, items)` が以下を判定:


- 【適切:定型連携】疾患/患者条件に応じた定型コンサルト(例:DM の眼科・腎臓内科)
- 【適切:条件該当】特定条件下で適切(例:CKD 重症で腎臓内科)
- 【適切:生活指導専門資源】(例:管理栄養士)
- 【過剰:条件非該当】減点対象だが軽度
- 未実施の推奨連携(例:DM の眼科・皮膚科)


専門医コンサルトの適切性は DB テーブルではなく**コード(`app/lib/consultation-evaluator.js`)のルールベース**で実装されている。疾患追加時はここに疾患分岐を足す。


### 8.2 学習者モード時の扱い


- `autoTreatmentUsed === true` の場合、コンサルト評価は**完全に評価対象外**
- feedback プロンプトで「コンサルトの有無は治療の質評価とは独立。減点しない」と明示


---


## 第 9 章 担当医任せ(学習者モード)


### 9.1 トリガー


`userPosition` が `NON_PHYSICIAN_POSITIONS`(医学生、医療従事者、その他、学習者)に該当すると、治療方針画面に「🩺 担当医に任せる」ボタンが表示される。


### 9.2 動作


- `auto-treatment-rules.js` で疾患・患者特性に応じた治療項目を自動選択
- 各 reaction に `acceptance_level: 'accepted'` を明示的に付与(これがないと薬効が反映されないバグ実績あり)
- フィードバック評価時は治療選択を評価対象外とし、問診・生活指導・患者対応の 3 軸で評価


### 9.3 評価点配分


- 問診(情報収集): 33 点
- 生活指導・患者教育: 34 点
- 患者対応(コミュニケーション): 33 点
- 合計 100 点


---


## 第 10 章 React 状態管理の落とし穴


### 10.1 useState の初期値が props 変化に追従しない


```javascript
// ❌ NG: labsRevealed や v1Revealed が後で変わっても labsStep は更新されない
const [labsStep, setLabsStep] = useState(v1Revealed ? 1 : (labsRevealed ? 2 : 1))


// ✅ OK: useEffect で同期
const [labsStep, setLabsStep] = useState(v1Revealed ? 1 : (labsRevealed ? 2 : 1))
useEffect(() => {
  if (labsRevealed) setLabsStep(2)
  else if (v1Revealed) setLabsStep(1)
}, [labsRevealed, v1Revealed])
```


### 10.2 visitParams のスコープ


`visitParams` は各 visit page のトップレベル useState で保持し、API 呼び出し時に body に含める。`patientParams: visitParams` で送る場合、`null` チェック必要なし(undefined fallback あり)。


### 10.3 lifestyle_agreements 参照時の typo 罠


`visitParams ? visitParams.lifestyle_agreements : null.slice(-20)` のような書き方は、`null.slice` で実行時エラーになるが、visitParams が常に truthy の場合は顕在化しない(過去の修正残り)。発見次第修正推奨。


---


## 第 11 章 既知の落とし穴・頻発バグ


### 11.1 evaluate-params の致命的失敗


cf88447 (2026-05-15) が安全リビジョン。これ以降、`userPosition` スコープ外参照、テンプレートリテラル内の `'+...+'` 混入などのバグが何度か入った経緯あり。


「lifestyle_agreements が問診で反映されない」と感じたら、まず evaluate-params が 500 を返していないかネットワークタブで確認。


### 11.2 raw URL のキャッシュ


`raw.githubusercontent.com` は数分単位でキャッシュする。コミット直後の検証は GitHub API (`/repos/.../commits/SHA`) の diff で行う。


### 11.3 str_replace の anchor 衝突


`if (hasStatin) tgDelta -= baseTG * 0.10` と `if (hasStatin) ldlDelta -= baseLDL * 0.35` のように似た構造が異なる lab に存在する。anchor は変数名(`tgDelta` / `ldlDelta`)を含めて unique にする。


### 11.4 CodeMirror 6 paste timeout


130KB+ ファイルへの insertText は CDP timeout(45s)に達することがある。Commit ボタンの有効化を見れば paste 自体は成功している。リトライではなく、ダイアログオープン処理だけ単独実行する。


### 11.5 patient_education の strictness='none'


過去に全 56 件の `none` 選択肢を一括削除した実績あり。新疾患追加時は最初から `none` を入れないこと(例外は第 3.10 節記載の 3 件のみ)。


### 11.6 CodeMirror 6 への大ファイル paste 時の二重追記(末尾連結)


GitHub Web UI の `edit` 画面で大ファイル(数万文字級の `visit2/route.js`、`visit3/route.js`、各 visit page など)を全文置換するときに発生する致命的な罠。


**症状**: `document.execCommand('selectAll')` → `document.execCommand('insertText', false, newCode)` の組み合わせで全置換したつもりが、実際は **古いファイル本体が末尾に残ったまま、新しいファイル本体が前に挿入される** 結果になる。発見できないまま commit すると `export const maxDuration`、`import` 文、`export async function POST` が 2 個ずつ存在する構文破壊ファイルが develop に push され、Vercel ビルドが失敗する。


**原因**: CodeMirror 6 は仮想スクロール (`.cm-scroller`) を使うため、未レンダリングのコード行は DOM に存在しない。`selectAll` で選択されるのは可視範囲の DOM 範囲のみで、未レンダリング部分は選択対象に含まれず削除されない。結果として `insertText` は可視範囲だけを置換し、その後ろに未レンダリングだった古いコードが残る。


**確認方法**: paste 後に `document.querySelector('.cm-content').textContent.length` を見ると数千文字しか返らないのに、実際の `view.state.doc.length` は数万文字あれば仮想スクロールが原因と確定。


**回避策(推奨)**: CodeMirror 内部 EditorView を直接 dispatch する。
```javascript
// 2026-05-20 時点の GitHub minify では cmTile.dom.cmTile.view にある
const view = document.querySelector('.cm-content').cmTile.dom.cmTile.view
view.dispatch({
  changes: { from: 0, to: view.state.doc.length, insert: newCode }
})
```
- パスは GitHub の minify 状況で変わる可能性あり。`cmTile.view`、`cmTile.dom.cmTile.view` 等を順に試す
- `view.state.doc.length` は仮想スクロールに関係なく真の長さを返す
- `dispatch({ changes: ... })` は仮想スクロールを介さず内部ステートを直接書き換える
- paste 後に `view.state.doc.length === newCode.length` を必ず検証してから commit


**やってはいけない回避策**:
- 充分なスクロールで全行をマテリアライズしてから selectAll → CDP timeout(45s)に達して失敗する(第 11.4 と同じ罠)
- GitHub Contents API 経由の PUT → ブラウザ session cookie 認証では通らず、PAT が必要


**過去の実例(2026-05-19、SHA `5832eb71`)**: visit3/route.js の薬剤検出 regex 追加コミットで、ファイル本体が末尾に丸ごと二重コピーされた状態で commit。直後に同じ手法で paste 失敗したのを `view.dispatch()` で復旧コミット(`2b1b5532`)。


### 11.7 大ファイル編集の推奨パターン:str_replace + view.dispatch()


大規模ファイル(visit page など 130KB+)に対して複数箇所の小さな修正を行う場合、**全文置換 paste よりも「ブラウザ上で str_replace 相当を順次適用してから 1 回だけ view.dispatch() で全置換」が安全**。


#### パターン


```javascript
(async () => {
  // 1. GitHub raw API から最新を取得
  const r = await fetch('https://api.github.com/repos/.../contents/PATH?ref=develop&t=' + Date.now(), {
    headers: { Accept: 'application/vnd.github.v3.raw' }, cache: 'no-store'
  });
  let text = await r.text();
  const origLen = text.length;

  // 2. 各 anchor の unique 性をチェック(0 や 2+ なら ERR)
  function countOccurrences(h, n) {
    let c = 0, p = 0;
    while ((p = h.indexOf(n, p)) !== -1) { c++; p += n.length; }
    return c;
  }

  // 3. 順次 str_replace
  const edits = [{ old: '...', new: '...' }, ...];
  for (const e of edits) {
    if (countOccurrences(text, e.old) !== 1) return 'ERR';
    text = text.replace(e.old, e.new);
  }

  // 4. CodeMirror 内部 view へ 1 回だけ dispatch
  const view = document.querySelector('.cm-content').cmTile.dom.cmTile.view;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }});
  
  // 5. paste 後に長さ一致を必ず検証
  await new Promise(r => setTimeout(r, 1500));
  const match = view.state.doc.length === text.length;
})()
```


#### 利点


- 全文 paste 1 回だけなので CodeMirror 仮想スクロール問題(11.6)を踏まない
- 各 anchor の出現回数チェックで誤適用を未然防止
- diff が小さいので GitHub 上の commit が読みやすい(行 +1/-1 程度)
- ブラウザの `window._...` 変数に依存しないので、ページ遷移後でも fetch から再現可能


#### 実績


2026-05-19 の問診終了推奨機能実装(Visit 1〜3 page.js、各 4 箇所 ×3 ファイル = 12 編集)を本パターンで実施、全 12 編集が 1 発成功・paste 一致確認済み。後続の tweak(`useState('detailed')` への変更、4 ファイル各 1 箇所)も同パターンで一発成功。


### 11.8 Vercel CDN による API レスポンスの静的キャッシュ汚染(2026-05-20 追加)


**症状**: DB を更新しても本番アプリが古いデータを表示し続ける。リロード・ハードリロードでも変わらない。


**原因**: Next.js 14 App Router は、認証もクエリパラメータもない素の GET API ルートを**自動的に静的最適化**し、Vercel CDN がそのレスポンスを最長数十分〜数時間キャッシュする。`x-vercel-cache: HIT, age=2820` のようにレスポンスヘッダで確認できる。


**影響を受けるルート**: 主に `/api/diseases`。他の主要 API は POST だったり認証付きだったりで自動的に動的扱いになるため発生しない(2026-05-20 時点では `/api/diseases` のみで確認)。


**回避策**: 該当ルートのファイル先頭に以下 2 行を追加。
```javascript
export const dynamic = 'force-dynamic'
export const revalidate = 0
```


これで Next.js が「静的最適化禁止、毎回サーバーで実行」と判定し、Vercel CDN もキャッシュしない(`x-vercel-cache: MISS, age=0` になる)。


**過去の実例(2026-05-20、PR #3、SHA `ddd8260`)**: 高尿酸血症の表示問題調査で `/api/diseases` が `age=2820`(47 分前)のキャッシュを返し続けていたことを発見。`force-dynamic` 化で根本解決。


**確認方法**: 開発者ツールの Network タブで該当 API のレスポンスヘッダを見る。`x-vercel-cache: HIT` かつ `age > 0` ならキャッシュ汚染を疑う。


### 11.9 指導カテゴリのループ閉じ忘れ(2026-05-21 追加)


**症状**: 服薬指導 sub_options がフロントで選択でき、`acceptance_level` も保存されるのに、検査値が全く変化しない/効きが弱い。


**原因**: `patient_education` テーブルに sub_options を増やしても、`visit2/route.js` と `visit3/route.js` の `effectiveAdherence` または `lifestyleEffect` 計算に **配線** していないと、選択は無意味になる。「フロント表示 → DB 保存 → 計算反映」の **3 段ループの最後が閉じていない** 状態。


**過去の実例(2026-05-21、PR #5)**: `medication` カテゴリの sub_options は 6 行も登録されていたが、薬効計算で参照されていなかった。`medicationGuidanceBonus = Math.min(0.20, medicationSubs.length * 0.05)` を 2 ファイル合計 +4 行追加するだけで解消。


**同種パターンの予兆**:
- 新カテゴリ追加(`purine`、`medication` 等)後に「効いている感じがしない」と感じる
- DB には選択結果が `lifestyle_agreements` や `consentedSubs` に入っているが、検査値の delta 計算式で当該カテゴリ名が grep に引っかからない


**防止策**:
- patient_education に新カテゴリを追加するときは、必ず以下 3 点を確認(チェックリスト 5.5 に統合済み):
  1. visit2/route.js の `consentedSubs.filter(...)` 内で当該カテゴリが参照されているか
  2. 計算式(`effectiveAdherence` / `lifestyleEffect` / `saltEffect` 等)に組み込まれているか
  3. visit3/route.js も同様に変更されているか
- `lifestyle` 系のカテゴリ → `lifestyleEffect` / `saltEffect` 系に加算
- `medication` 系のカテゴリ → `effectiveAdherence` の bonus として加算(全 delta をスケーリング)


### 11.10 UI 入力パターン:インライン編集 vs フォーム + カード(2026-05-21 追加)


**経緯**: コンサルト UI が「配列要素を直接インラインで編集」(`{specialty: '', reason: ''}` を空のまま追加し、その場で `<select>` と `<textarea>` を編集)する構造になっていた。**「依頼済み」と「未入力」の見た目が同じ**になり、UX が極めて悪かった。


**改修(2026-05-21、PR #5)**: 全 Visit page を以下のパターンに統一。
1. 別 state(`formSpecialty`、`formReason`)に**下書き**を持つ
2. 「📨 依頼する」ボタン押下で `consultations` 配列に push、フォームクリア
3. 配列要素は**読み取り専用カード**(緑色)+「✕ 取消」ボタンで表示
4. 連続して別の依頼ができる


**設計原則(同種 UI を作るとき)**:

| パターン | 適する場面 | 例 |
|---|---|---|
| **インライン編集**(配列要素 = フォーム) | 編集が頻繁、変更を即時保存したい | スプレッドシート風入力 |
| **フォーム + カード**(下書き → 確定 → 表示) | 確定後の表示と入力中の表示を分けたい、誤入力リスクが高い、視覚的に「実施済み」感を強調したい | 投薬・コンサルト・処方依頼 |


**判断基準**: 「『未入力』と『送信済み』が見た目で区別できるか?」が分かれ目。区別できない UI は学習者を惑わせる。


### 11.12 visit2/visit3 route.js での変数名ミス（2026-05-28 追加）

**症状**: Visit2/3 の生成で `XXX is not defined` エラーが発生。

**原因パターン1 - 疾患名変数の不一致**:
- `visit2/route.js` では `const disease = caseData.disease_name` と定義されている
- 新疾患の計算式を `diseaseName === '慢性腎臓病'` と書くと `diseaseName is not defined` エラー
- **正しくは `disease === '慢性腎臓病'`**

**原因パターン2 - 薬剤検出変数の定義漏れ**:
- `visit3/route.js` は `v3MedNames` を使用（`consentedMedNames` ではない）
- `const hasRAS_CKD = /.../test(consentedMedNames)` と書いても、visit3 では `v3MedNames` が使われるため未定義になる
- 追加した検出変数が実際にコミットに含まれているか、grep で確認すること

**確認コマンド**:
```bash
grep "const disease\|diseaseName" app/api/visit2/route.js
grep "const hasRAS_CKD\|v3MedNames\|consentedMedNames" app/api/visit3/route.js
```

### 11.13 patient.vitals.height/weight/bmi は undefined（2026-05-28 追加）

**症状**: Visit1/2/3 で身長・体重・BMI が空欄表示。計算式で `wKg = 0` になり全 delta がゼロ。

**原因**: `patient_data` では `height`・`weight`・`bmi` が `patient.vitals` の中ではなくトップレベルに格納されている。`patient.vitals.height` は `undefined`。

**修正パターン**:
```javascript
// ❌ NG
const weight = parseFloat(patient.vitals.weight)
// ✅ OK（両パスをフォールバック）
const weight = parseFloat(patient.weight) || parseFloat(patient.vitals?.weight) || 70
```

JSX の表示でも同様。`{patient.vitals?.weight}kg` → `{patient.weight || patient.vitals?.weight}kg`

**防止**: Phase 5.12 で全ファイルを grep してから PR を作成する。

### 11.14 patient_education の instruction_key が UI に英語表示される（2026-05-28 追加）

**症状**: 生活指導メニューに `ckd_salt`・`ckd_protein` 等の英語スラッグが表示される。

**原因**: UI の表示コードが `edu.instruction_detail` を参照しているが、DB に `instruction_detail` が設定されていない（または英語のまま）。

**対処**:
1. DB の `instruction_detail` を短い日本語ラベルに UPDATE する
2. 今後の新疾患では INSERT 時から `instruction_detail` を日本語で設定する

```sql
UPDATE patient_education 
SET instruction_detail = '減塩指導（目標3〜6g/日）'
WHERE instruction_key = 'ckd_salt' AND disease_id = '<disease_id>';
```

### 11.11 Visit 1/2/3 page.js の完全コピー構造(2026-05-21 追加)


**現状**: `app/cases/[id]/page.js`(Visit 1)、`visit2/page.js`、`visit3/page.js` は **治療方針セクションを含む大部分が完全コピーペースト**で複製されている。共通コンポーネント化されていない。


**含まれる主な共通 UI**:
- 投薬選択セクション
- 生活指導(patient_education)セクション
- コンサルト依頼セクション(2026-05-21 改修)
- 検査オーダー、医療機器選択
- 患者特性パネル(ParameterPanel)


**改修ルール**: これらの UI を 1 つでも修正したら、**必ず 3 ファイル全てに同じ改修を適用**。設計書 5.5(薬剤検出 regex の visit3 漏れ)、5.5(検出 OK 計算未使用)と同じ「Visit 3 漏れ」パターンを生む。


**過去の実例**:
- 2026-05-19: 薬剤検出 regex 9 個が visit3/route.js から欠落 → 検査値が動かない
- 2026-05-21: コンサルト UI 改修で visit1 だけ先に修正 → 動作確認後すぐに visit2/3 にも横展開(本セッションは漏れなく完了)


**機械的横展開のテンプレート手順**:
1. Visit 1 で完成形を作成、コミット
2. preview で動作確認
3. Visit 2 / Visit 3 page.js を取得 → 同じ str_replace anchor で改修(構造完全同一)
4. 各々コミット → 3 ファイル分の Vercel ビルド成功確認


**将来的な改善案**: 治療方針セクションを `<TreatmentPlanSection>` として共通コンポーネント化すべき。ただしリスクが大きいので、未着手の改修候補として記録(2026-05-21 時点)。


---


## 第 12 章 デバッグ手法


### 12.1 GitHub API でコミット検証


```javascript
// 最新コミット取得
fetch('https://api.github.com/repos/k1r0nk321/PC-training/commits?path=PATH&sha=develop&per_page=1', {
  headers: { Accept: 'application/vnd.github+json' }
})


// 特定コミットの diff
fetch('https://api.github.com/repos/k1r0nk321/PC-training/commits/SHA', {
  headers: { Accept: 'application/vnd.github+json' }
})
// → data.files[i].patch で diff 取得
```


### 12.2 Vercel Preview の確認


- develop に commit すると `pc-training-git-develop-k1r0nk321.vercel.app` 自動更新
- 反映までおおむね 1-2 分
- ビルド失敗時は Vercel ダッシュボードでログ確認


### 12.3 Vercel Production リデプロイ(緊急時)


DB を更新しても本番に反映されない場合、Vercel ダッシュボードから手動 Redeploy できる。

1. https://vercel.com/k1r0nk321/pc-training/deployments を開く
2. 最新の Production デプロイ(`Current` ラベル付き)の右端「⋯」メニュー
3. `Redeploy` → Build Cache **未チェックのまま** → `Redeploy` クリック
4. 1-2 分で完了

ただし `/api/diseases` のような CDN キャッシュ問題は **リデプロイで一時的に解消するだけ**で、再度数十分でキャッシュ汚染が始まる。根本対策は第 11.8 節の `force-dynamic` 化。


### 12.4 Supabase クエリ


- ユーザーは Supabase ダッシュボードの SQL Editor を使う
- 私(Claude)は SQL ファイルを `/mnt/user-data/outputs/` に出力し、STEP 1, 2, 3... の段階形式で提供する
- 設計書の列名が実態と異なるリスクがあるため、初手は `information_schema.columns` で実列名を確認するクエリを推奨


---


### 12.5 API 新規作成時のトラブルシュート(2026-05-21 追記)


**症状**: 新規 API ルートを作成したが「アドバイスを取得できませんでした」「500エラー」が返る。

**チェックリスト**（発生頻度順）:

| 原因 | 確認方法 | 修正 |
|---|---|---|
| モデル名の誤り | `claude-sonnet-4-20250514` など存在しないモデルID | 正しくは `claude-sonnet-4-6` または `claude-haiku-4-5-20251001`（設計書 2.1 参照） |
| claudeCreate 未使用 | `new Anthropic()` を直接使っている | `claudeCreate` ラッパー（`../../lib/claude-client`）を使う |
| importパス誤り | `@/app/lib/supabase-admin` など存在しないモジュール | `getAdminClient` は各 route.js 内でインライン定義が慣例 |
| maxDuration 未設定 | タイムアウトで失敗 | `export const maxDuration = 60` を先頭に追加 |

**Vercel ランタイムログでの確認方法**:
```javascript
// Vercel MCP
Vercel:get_runtime_logs({
  projectId: 'pc-training',
  teamId: 'k1r0nk321',
  level: ['error'],
  since: '30m'
})
// → level=error のログにエラー内容が表示される
```

**過去の実例(2026-05-21)**:
- `new Anthropic()` 直接使用 → 500エラー → `claudeCreate` ラッパーに変更で解消
- モデル名 `claude-sonnet-4-20250514` → 500エラー → `claude-sonnet-4-6` に修正で解消


### 12.6 PR コンフリクト解消(2026-05-21 追記)


**症状**: PR 作成時に「This branch has conflicts that must be resolved」が表示される。

**原因**: main と develop が diverge している（両方が同じファイルを変更した）。

**解消手順（GitHub Web UI）**:
1. PR 画面の「Resolve conflicts」ボタンをクリック
2. コンフリクトエディタで「Accept current change」（develop 側）を選択
3. 「Mark as resolved」をクリック
4. 全ファイル解決後「Commit merge」をクリック
5. PR 画面に戻り「Squash and merge」でマージ

**Claude in Chrome での自動解消**:
```javascript
// 全コンフリクトに Accept current change（develop 側）を適用
while (true) {
  const btn = document.querySelectorAll('button').find(b =>
    /Accept current change/i.test(b.textContent)
  )
  if (!btn) break
  btn.click()
  await wait(300)
}
// Mark as resolved → Next → 繰り返し → Commit merge
```

**予防策**: develop に main を定期的にマージして diverge を防ぐ。特に PR マージ後は即座に develop へ反映する。


## 第 13 章 ブラウザ MCP 経由作業のノウハウ(2026-05-21 追加)


本章は Claude が Claude in Chrome MCP 経由で GitHub Web UI を代行操作する際の実戦パターン集。中前先生はクリックの最終確認のみ行えば良いように、Claude は「ダイアログを開いて submit ボタンを enabled 状態にする」までを自動化する。


### 13.1 セッション開始時のブラウザ接続確認


Claude in Chrome は Anthropic の web チャットセッション開始時、または環境変化(ネットワーク切断・PC 移動)時に接続が切れることがある。


**接続確認の手順**:
1. `Claude in Chrome:list_connected_browsers` を呼ぶ
2. 複数ブラウザがあれば必ず `ask_user_input_v0` で先生に選択させる(自分で選ばない)
3. `Claude in Chrome:select_browser` で deviceId を指定して選択
4. `Claude in Chrome:tabs_context_mcp` で利用可能タブを取得


**よく使うタブの典型構成**:
- GitHub edit/blob page(コード編集中)
- Vercel deployments(ビルド状態確認)
- Supabase SQL editor(DB 操作)
- preview / production URL(動作確認)


### 13.2 大規模ファイル編集の標準手順


設計書 11.7 のパターンを踏襲。**Visit page (133〜140KB)、API route (24〜27KB) すべて同じ手順**で安全に編集できる。


**STEP A: 取得**
```javascript
const r = await fetch('https://api.github.com/repos/.../contents/PATH?ref=develop&t=' + Date.now(), {
  headers: { Accept: 'application/vnd.github.v3.raw' }, cache: 'no-store',
});
const text = await r.text();
window._origText = text;  // 念のためバックアップ
```


**STEP B: anchor の一意性確認 + 順次 replace**
```javascript
function countOccurrences(h, n) {
  let c = 0, p = 0;
  while ((p = h.indexOf(n, p)) !== -1) { c++; p += n.length; }
  return c;
}
function applyEdit(old, neu, label) {
  if (countOccurrences(text, old) !== 1) { log.push({label, status:'ERR'}); return false; }
  text = text.replace(old, neu);
  log.push({label, status:'OK', diff: neu.length - old.length});
  return true;
}
```


**STEP C: 構文チェック(必須)**
```javascript
// 文字列・コメント外で {, (, [ の対が合うか
let brace = 0, paren = 0, bracket = 0;
// ... 文字列リテラル / コメントを除外しながらカウント
const all_pass = brace === 0 && paren === 0 && bracket === 0 && ...
```


**STEP D: CodeMirror への dispatch**
```javascript
const cmContent = document.querySelector('.cm-content');
let view = null;
const candidates = [
  () => cmContent.cmTile?.dom?.cmTile?.view,
  () => cmContent.cmTile?.view,
  () => cmContent.cmView?.view,
  () => cmContent.cmView,
];
for (const fn of candidates) {
  try { const v = fn(); if (v && v.state && v.dispatch) { view = v; break; } } catch (e) {}
}
view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
```


**STEP E: paste 後検証(必須)**
```javascript
await new Promise(r => setTimeout(r, 1500));
const docLen = view.state.doc.length;
const docHead = view.state.doc.sliceString(0, 200);
const docTail = view.state.doc.sliceString(docLen - 100, docLen);
const ok = docLen === text.length && docHead === text.substring(0, 200) && docTail === text.substring(text.length - 100);
```


**STEP F: コミットダイアログ操作**
```javascript
// Commit changes... ボタンを押す
const commitBtn = Array.from(document.querySelectorAll('button')).find(b => 
  /^Commit changes\.\.\.?$/i.test((b.textContent || '').trim())
);
commitBtn.click();

// ダイアログ開く待ち
let dialog = null;
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 300));
  dialog = Array.from(document.querySelectorAll('dialog[open], [role="dialog"]')).find(d => 
    d.offsetParent !== null && /Commit message/i.test(d.innerText || '')
  );
  if (dialog) break;
}

// タイトル入力(React 制御コンポーネント対応)
const titleInput = dialog.querySelector('input[type="text"], input:not([type])');
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
setter.call(titleInput, 'feat(scope): 日本語タイトル');
titleInput.dispatchEvent(new Event('input', { bubbles: true }));

// description は空に上書き(GitHub の自動描画を消すため)
const descTextarea = dialog.querySelector('textarea');
if (descTextarea) {
  const taSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  taSetter.call(descTextarea, '');
  descTextarea.dispatchEvent(new Event('input', { bubbles: true }));
}

// 緑「Commit changes」ボタンは中前先生に押してもらう(ここで停止)
```


### 13.3 タブ ID 管理


タブ ID(例: `tabId: 80423878`)はブラウザ再接続のたびに変化する。**コード内に固定値で埋め込まない**。`tabs_context_mcp` で取得した値を都度使う。


### 13.4 ダイアログ操作の React 罠


GitHub の commit dialog は React の制御コンポーネントを使用。**素の `input.value = ...` は反映されない**。

✅ 正しい:
```javascript
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
setter.call(input, value);
input.dispatchEvent(new Event('input', { bubbles: true }));
```


### 13.5 PR 作成 → マージのワークフロー


```javascript
// 1. compare ページへ
navigate('https://github.com/k1r0nk321/PC-training/compare/main...develop');

// 2. 「Create pull request」ボタンクリック
//    → タイトル "Develop" がデフォルト表示される PR 作成フォームへ
const createBtn = Array.from(document.querySelectorAll('button'))
  .find(b => /^Create pull request$/i.test(b.textContent.trim()));
createBtn.click();

// 3. PR タイトル + 本文を React-setter で投入
const titleInput = document.querySelector('input[name="pull_request[title]"]');
// ... setter.call(titleInput, title);
const bodyTextarea = document.querySelector('textarea[name="pull_request[body]"]');
// ... taSetter.call(bodyTextarea, body);

// 4. submit ボタン押下は中前先生に依頼
// 5. PR 作成後、検証 → Squash & merge は通常 GitHub の標準動作
```


### 13.6 動作確認とロールバック


**正常系の検証ポイント**:
1. GitHub API でコミット SHA・diff 確認
2. Vercel MCP (`Vercel:list_deployments`) で `state: READY`、`target: production` を確認
3. preview URL での実機動作確認(可能なら中前先生)


**ロールバック手段**:
- Vercel ダッシュボード → `isRollbackCandidate: true` の過去デプロイから即時切替可能
- 設計書 12.3 の Redeploy も使えるが、CDN キャッシュ問題には根本対処にならない


### 13.7 Claude in Chrome が使えない場合のフォールバック


セッション開始時にブラウザが切断されていた場合(別 PC、ネットワーク変化等):
- **Supabase MCP / Vercel MCP は引き続き使える** → DB 操作とデプロイ状態確認は可能
- **GitHub への書き込みは不可** → 手順を文書化して中前先生に渡し、PC 復帰後に再開
- **web_search / web_fetch は使える**(GitHub private リポジトリは不可)


### 13.8 出力フィルタによる日本語塗りつぶし対策


Claude in Chrome の `javascript_tool` は、出力に長い日本語・URL・base64 を含むと `[BLOCKED: Cookie/query string data]` で塗りつぶされることがある。回避策:
- 文字コード列で返す:`s.split('').map(c => c.charCodeAt(0))`
- Unicode escape 化:`s.replace(/[\u0080-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))`
- ASCII 行のみ抽出して構造把握 → 日本語部分は別途確認


### 13.9 一括操作と段階分割の判断


- **小規模変更(< 1KB の str_replace 数個)**: 1 ターンで `applyEdit → dispatch → コミットダイアログ` まで一気に進める
- **中規模変更(JSX 全体書き換えなど)**: anchor 確認 → str_replace → 構文チェック → dispatch の各段階で結果を確認しながら進める
- **大規模変更(複数ファイル横展開)**: 1 ファイルずつ完結させて中前先生のクリックを挟む。3 ファイル一括で paste するとリスクが累積する


---


## 第 14 章 改修パターンのリファレンス(2026-05-21 追加)


### 14.1 「3 段ループ」確認パターン


新機能が「フロントで選択可 → DB 保存 → 計算反映」の 3 段全てに配線されているか確認するチェックリスト:

| 段階 | 確認内容 |
|---|---|
| 1. フロント表示 | 該当 visit page で sub_options が `<select>` または `<button>` で表示されるか |
| 2. DB 保存 | `acceptance_level` 付きで Visit 終了時に DB に書き込まれるか |
| 3. 計算反映 | visit2/visit3 route.js の計算式に当該データが組み込まれているか |


### 14.2 Visit 1/2/3 横展開パターン


| 改修箇所 | 影響範囲 | 漏れチェック |
|---|---|---|
| 治療方針セクション UI | `app/cases/[id]/page.js`、`visit2/page.js`、`visit3/page.js` | 3 ファイル grep |
| 検査値計算 | `app/api/visit2/route.js`、`app/api/visit3/route.js` | 2 ファイル grep |
| 検査表示制御 | DISEASE_LAB_MAP(visit page 内) | 3 ファイル grep |
| フィードバック評価 | `app/api/feedback/route.js`、`app/api/visit3-feedback/route.js` | 2 ファイル grep |


### 14.3 改修サイズ別の作業時間目安


| 規模 | 例 | 目安 |
|---|---|---|
| 数行追加(API ルート 1 箇所) | Q2 medicationGuidanceBonus | 5 分/ファイル × 2 ファイル |
| JSX セクション置換(1 ファイル) | コンサルト UI 改修 | 15 分(設計議論含む) |
| Visit 1/2/3 全展開 | コンサルト UI 横展開 | 30 分(機械的コピー) |
| 新疾患追加 | 高尿酸血症 | 数時間(チェックリスト全工程) |



---


## 第 15 章 評価システム全体設計(2026-05-21 策定)


### 15.1 設計の核心原則


```
guideline_rules テーブルが唯一の情報源
        ↓
指導医アドバイス・採点基準・フィードバックが
全て同じデータを参照
        ↓
ガイドライン改訂時はDBを更新するだけで
全機能に自動反映(将来目標)
```


### 15.2 新設テーブル・列(2026-05-21 実装済み)


#### diseases テーブルへの追加列

```sql
evaluation_category text DEFAULT 'improvement'
  -- 'improvement'          改善型（糖尿病・脂質異常症）
  -- 'target'               到達型（高血圧・高尿酸血症）
  -- 'process_asymptomatic' プロセス型・無症状（CKD・心不全無症状）
  -- 'suppression'          抑制型・有症状（CKD・心不全有症状）
  -- 'symptom_score'        症状型（喘息・COPD）
  -- 'process_acute'        プロセス型・急性期（感染症）

symptom_check_fields jsonb DEFAULT NULL
  -- CKD・心不全で症状有無を自動判定するフィールド定義
```

現在の設定値:
- 2型糖尿病: `improvement`
- 高血圧症: `target`
- 脂質異常症: `improvement`
- 高尿酸血症・痛風: `target`


#### guideline_rules テーブル(新設)

```sql
CREATE TABLE guideline_rules (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  disease_id       uuid REFERENCES diseases(id) ON DELETE CASCADE,
  rule_type        text NOT NULL,
  -- 'first_line' / 'stepup' / 'contraindication' / 'caution'
  -- 'referral' / 'lifestyle' / 'monitoring'
  condition        text,          -- 適用条件 例: 'eGFR < 30'
  content          text NOT NULL, -- アドバイス本文
  evidence_level   text,          -- 'A' / 'B' / 'C'
  source           text,          -- 出典 例: 'KDIGO 2024'
  scoring_weight   int DEFAULT 3, -- 採点上の重要度 1〜5
  scoring_type     text DEFAULT 'recommended',
  -- 'required' / 'recommended' / 'optional' / 'forbidden'
  visit_timing     text DEFAULT 'any',
  -- 'visit1' / 'any' / 'progressive'
  outcome_type     text DEFAULT 'process',
  -- 'improvement' / 'target' / 'suppression' / 'symptom' / 'process'
  outcome_target   jsonb DEFAULT NULL,
  sort_order       int DEFAULT 10,
  is_active        boolean DEFAULT true,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);
```

投入済みデータ:
- 高血圧症: 24件 (JSH 2019 準拠)
- 2型糖尿病: 25件 (糖尿病治療ガイド 2024 準拠)
- 脂質異常症: 20件 (動脈硬化性疾患予防ガイドライン 2022 準拠)
- 高尿酸血症・痛風: 19件 (高尿酸血症・痛風の治療ガイドライン 第3版 準拠)


### 15.3 評価カテゴリ別配点設計(将来実装予定)


| 評価軸 | 改善型 | 到達型 | プロセス型無症状 | 抑制型有症状 | 症状型 | プロセス型急性期 |
|---|---|---|---|---|---|---|
| 問診・情報収集 | 25点 | 25点 | 30点 | 25点 | 25点 | 35点 |
| 治療選択の妥当性 | 20点 | 20点 | 35点 | 30点 | 30点 | 40点 |
| アウトカム | 20点 | 20点 | 0点 | 15点 | 20点 | 5点 |
| 改善変化量 | 10点 | 10点 | 0点 | 10点 | 10点 | 5点 |
| 生活指導の段階的実施 | 15点 | 15点 | 25点 | 10点 | 5点 | 5点 |
| 患者対応 | 10点 | 10点 | 10点 | 10点 | 10点 | 10点 |

🚨 **現時点では未実装**。`feedback/route.js` の改訂は今後のフェーズ3で対応予定。


### 15.4 疾患別アウトカムターゲット


| 疾患 | カテゴリ | アウトカムターゲット | 満点条件 |
|---|---|---|---|
| 2型糖尿病 | 改善型 | HbA1c | <7.0%到達 または -1.5%以上改善 |
| 脂質異常症 | 改善型 | LDL | 目標値到達 または -30%以上改善 |
| 高血圧症 | 到達型 | 収縮期血圧 | <130mmHg（75歳以上は<140） |
| 高尿酸血症 | 到達型 | UA | <6.0mg/dL（痛風歴あり<5.0） |
| CKD無症状 | プロセス型 | なし | 治療選択・指導の質のみ |
| CKD有症状 | 抑制型 | eGFR低下速度 | <1.0/月（Visit3以降で評価） |
| 心不全無症状 | プロセス型 | なし | 治療選択・指導の質のみ |
| 心不全有症状 | 抑制型 | NYHA・BNP | NYHA改善またはBNP低下 |
| 気管支喘息 | 症状型 | ACTスコア | ≥20またはΔ+4以上 |
| COPD | 症状型 | CATスコア | <10またはΔ-2以上 |


### 15.5 指導医アドバイス機能(2026-05-21 実装済み)


#### UIの実装

- **疾患タイル右上の ℹ️ ボタン**：タップするとガイドライン閲覧パネルが表示。全ユーザー閲覧可能（ログイン不要）
- **治療方針画面の「🩺 指導医に相談」ボタン**：Visit1/2/3 全て実装済み

ボタン位置の設計:

| 身分 | 配置 |
|---|---|
| 医師・研修医・専攻医 | 学習モードブロックなし。右寄せで単独表示 |
| 学習者・医学生・医療従事者 | 学習モード（黄色ブロック）内で「担当医に任せる」と横並び表示 |


#### APIルート: `/api/treatment-advice`

```
POST /api/treatment-advice
入力:
  diseaseName, diseaseId, visitNumber
  patientData（検査値・バイタル）
  selectedMeds（選択済み薬剤リスト）
  allMeds（全薬剤候補）
  selectedEducation（同意済み生活指導）
  rejectedEducation（拒否された生活指導）
  consultations（コンサルト）
  userPosition（身分）

処理:
  guideline_rules テーブルから該当疾患のルールを取得
  選択済み・未選択・拒否の状態を照合
  claudeCreate(claude-sonnet-4-6) でアドバイス生成

出力形式（4ブロック構造）:
  🚨 緊急確認: 禁忌に該当する選択
  ✅ 適切な選択: 良い選択の評価
  ⚠️ 次の一手: 優先度の高い未実施1〜2項目
  ℹ️ 長期的な視点: 拒否された指導・将来の課題
```

生活指導の段階的アドバイス原則:
1. 一度に全ての生活改善を求めない
2. 患者が既に同意している項目を最初に評価する
3. 次に優先すべき1〜2項目だけを追加推奨する
4. 患者が拒否した項目はℹ️で次のVisitへの課題として提示


### 15.6 medications テーブル追加データ(2026-05-21)


脂質異常症に以下を追加投入:
- ペマフィブラート（パルモディア）: 高TG血症の第一選択（`first_line=true`、sort_order=25）
- アリロクマブ（プラルエント）: PCSK9阻害薬（`first_line=false`、sort_order=55）

※ エボロクマブ（レパーサ）は既存投入済み。


---





