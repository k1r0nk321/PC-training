'use client'
import { useRouter } from 'next/navigation'

export default function UsagePage() {
  const router = useRouter()

  const sectionStyle = {
    backgroundColor: 'white',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    padding: '16px',
    marginBottom: '14px',
  }
  const h2Style = {
    fontSize: '15px',
    fontWeight: 'bold',
    color: '#0369a1',
    margin: '0 0 10px',
    paddingBottom: '6px',
    borderBottom: '2px solid #bae6fd',
  }
  const h3Style = {
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#1e40af',
    margin: '14px 0 6px',
  }
  const pStyle = { fontSize: '13px', color: '#334155', lineHeight: 1.7, margin: '0 0 8px' }
  const liStyle = { fontSize: '13px', color: '#334155', lineHeight: 1.7, marginBottom: '4px' }
  const ulStyle = { paddingLeft: '20px', margin: '4px 0 10px' }
  const noteBoxStyle = {
    backgroundColor: '#f0f9ff', borderLeft: '4px solid #0369a1',
    padding: '10px 12px', margin: '8px 0', borderRadius: '4px',
    fontSize: '12px', color: '#0c4a6e', lineHeight: 1.6,
  }
  const tocLink = {
    fontSize: '13px', color: '#0369a1', textDecoration: 'none',
    padding: '6px 8px', borderRadius: '4px', display: 'block',
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '40px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '16px' }}>

        {/* ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <button onClick={function() { router.push('/cases') }}
            style={{ padding: '6px 12px', fontSize: '13px', backgroundColor: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', color: '#475569' }}>
            ← 戻る
          </button>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>📖 PC-training の使い方</h1>
        </div>

        {/* 目次 */}
        <div style={sectionStyle}>
          <h2 style={Object.assign({}, h2Style, { borderBottom: 'none', marginBottom: '6px' })}>▼ 目次</h2>
          <div>
            <a href="#sec1" style={tocLink}>1. このアプリは何?</a>
            <a href="#sec2" style={tocLink}>2. はじめての方へ(基本の流れ)</a>
            <a href="#sec3" style={tocLink}>3. Visit 1:初診の進め方</a>
            <a href="#sec4" style={tocLink}>4. Visit 2/3:再診の進め方</a>
            <a href="#sec5" style={tocLink}>5. 学習モード(担当医に任せる)</a>
            <a href="#sec6" style={tocLink}>6. 指導医コーチング機能</a>
            <a href="#sec7" style={tocLink}>7. デモ利用(身分選択)について</a>
            <a href="#sec8" style={tocLink}>8. カルテ機能</a>
            <a href="#sec9" style={tocLink}>9. 採点ロジック</a>
            <a href="#sec10" style={tocLink}>10. フィードバックの見方</a>
            <a href="#sec11" style={tocLink}>11. よくある質問・コツ</a>
          </div>
        </div>

        {/* 1. このアプリは何? */}
        <div id="sec1" style={sectionStyle}>
          <h2 style={h2Style}>1. このアプリは何?</h2>
          <p style={pStyle}>
            <b>PC-training</b> は、プライマリケアの外来診療をシミュレーションで学べる学習アプリです。
            実際の診察に近い流れで、患者(AI)との対話、検査、治療方針の決定、そしてフィードバックまでを体験できます。
          </p>
          <h3 style={h3Style}>対象疾患</h3>
          <ul style={ulStyle}>
            <li style={liStyle}>2型糖尿病</li>
            <li style={liStyle}>高血圧症</li>
            <li style={liStyle}>脂質異常症</li>
          </ul>
          <h3 style={h3Style}>対象</h3>
          <p style={pStyle}>研修医・専攻医・指導医・医学生・医療従事者、およびデモ利用者(身分選択可能)</p>
          <h3 style={h3Style}>進行</h3>
          <p style={pStyle}>初診(Visit 1) → 4週間後の再診(Visit 2) → 8週間後の再診(Visit 3) で1症例完結</p>
        </div>

        {/* 2. 基本の流れ */}
        <div id="sec2" style={sectionStyle}>
          <h2 style={h2Style}>2. はじめての方へ(基本の流れ)</h2>
          <p style={pStyle}>1症例の流れは以下の通りです。1症例は約20〜40分で完遂できます。</p>
          <ol style={ulStyle}>
            <li style={liStyle}><b>症例選択</b>:疾患を選んでモデル症例 or ランダム生成を開始</li>
            <li style={liStyle}><b>Visit 1 問診</b>:AI 患者と対話して主訴・既往・社会歴を収集</li>
            <li style={liStyle}><b>診察・検査の依頼</b>:必要な身体診察・検査を選択して結果を取得</li>
            <li style={liStyle}><b>治療方針の決定</b>:生活指導・投薬・機器・専門医コンサルトを選択</li>
            <li style={liStyle}><b>フィードバック</b>:採点と改善ポイントを確認</li>
            <li style={liStyle}><b>Visit 2 へ進む</b>:4週間後の経過(血圧・体重・症状)を確認</li>
            <li style={liStyle}><b>Visit 3 で完結</b>:8週間後の最終評価と総合フィードバック</li>
          </ol>
          <div style={noteBoxStyle}>
            ⚠️ 途中で離脱しても自動保存されます。トップの「中断中の症例」から再開できます。
          </div>
        </div>

        {/* 3. Visit 1 */}
        <div id="sec3" style={sectionStyle}>
          <h2 style={h2Style}>3. Visit 1:初診の進め方</h2>

          <h3 style={h3Style}>3-1. 問診画面(💬 発言)</h3>
          <p style={pStyle}>
            入力欄に質問を入力し <b>💬 発言</b> ボタン(または Enter)で送信。AI 患者が応答します。
            患者は症例ごとの<b>性格・年齢・生活背景</b>を持ち、応答が自然に変化します。
          </p>
          <ul style={ulStyle}>
            <li style={liStyle}>主訴・現病歴・既往歴・家族歴・社会歴を順に確認</li>
            <li style={liStyle}>紹介状つきの症例では「紹介状」と入力すると前医からの紹介状を表示</li>
            <li style={liStyle}>問診回数の多さは「丁寧な情報収集」として加点される(回数自体は減点対象ではない)</li>
          </ul>

          <h3 style={h3Style}>3-2. 診察・検査の依頼(🔬 ボタン)</h3>
          <p style={pStyle}>入力欄の右にある <b>🔬 診察・検査</b> ボタンでモーダルを開き、以下を依頼:</p>
          <ul style={ulStyle}>
            <li style={liStyle}><b>ベースライン採血セット</b>:HbA1c・脂質・電解質・腎機能などの基本パネル</li>
            <li style={liStyle}><b>身体診察</b>:共通項目(胸部聴診・腹部触診・神経学的所見 など)+ 疾患固有項目(アキレス腱反射・黄色腫 など)</li>
            <li style={liStyle}><b>追加血液検査</b>:内分泌・心血管・脂質精査・二次性高血圧スクリーニング など</li>
            <li style={liStyle}><b>画像検査</b>:胸部X線・心エコー・頸動脈エコー・冠動脈CT など</li>
            <li style={liStyle}><b>生理検査</b>:心電図・ABI/CAVI・24時間血圧計 など</li>
            <li style={liStyle}><b>自由記述</b>:メニューにない検査を文章で依頼(AI が解釈して結果生成)</li>
          </ul>
          <p style={pStyle}>一度実施した項目はグレーアウトされ、重複オーダーを防ぎます。</p>

          <h3 style={h3Style}>3-3. 患者特性パネル(📊)</h3>
          <p style={pStyle}>
            問診で得た情報をリアルタイムで可視化。性格・生活習慣・★パラメータ(ストレス・忙しさ・意欲・信頼度)
            が表示され、問診の進展に応じて変動します。
          </p>

          <h3 style={h3Style}>3-4. 治療方針の決定</h3>
          <p style={pStyle}>
            「治療方針を決定する →」ボタンで治療画面へ。以下のカテゴリから選択してください:
          </p>
          <ul style={ulStyle}>
            <li style={liStyle}><b>生活指導</b>:食事・運動・禁煙・節酒・体重管理 などのカテゴリ別</li>
            <li style={liStyle}><b>投薬</b>:疾患別の第一選択・第二選択薬から選択</li>
            <li style={liStyle}><b>医療機器</b>:SMBG・家庭血圧計 など</li>
            <li style={liStyle}><b>専門医コンサルト</b>(複数科対応):眼科・腎臓・循環器・皮膚科 など、各科ごとに紹介理由を記載</li>
            <li style={liStyle}><b>既存薬の継続/中止判断</b>:来院前から服用中の薬の取扱い</li>
          </ul>
          <p style={pStyle}>
            各項目選択時には患者反応(💚 同意 / 💛 部分同意 / ❤️ 拒否)が表示されます。
            拒否や部分同意には「説得」を行うことができ、より丁寧な説明で承諾率が上がります。
          </p>
        </div>

        {/* 4. Visit 2/3 */}
        <div id="sec4" style={sectionStyle}>
          <h2 style={h2Style}>4. Visit 2/3:再診の進め方</h2>
          <p style={pStyle}>
            Visit 1 のフィードバック後に「Visit 2 へ進む」を押すと、4週間後の再診に進みます。
            患者は Visit 1 の治療結果を反映した状態で来院します。
          </p>
          <ul style={ulStyle}>
            <li style={liStyle}>冒頭で「お薬しっかり飲めています」「血圧計、毎日測ってます」など、<b>アドヒアランス報告</b>が出ます</li>
            <li style={liStyle}>Visit 1 で選んだ治療は引き継がれますが、追加・変更・中止が可能</li>
            <li style={liStyle}>採血・血圧・体重などの<b>検査値変化</b>が確認できます</li>
            <li style={liStyle}>Visit 3 は8週間後の再診で、<b>総合評価</b>につながります</li>
          </ul>
          <div style={noteBoxStyle}>
            患者の応答は「同意して受け取った治療」のみ実施したものとして反映されます。
            同意を得ずに処方した薬は「飲んでいない」として扱われ、検査値も改善しません。
          </div>
        </div>

        {/* 5. 学習モード */}
        <div id="sec5" style={sectionStyle}>
          <h2 style={h2Style}>5. 学習モード(担当医に任せる)</h2>
          <p style={pStyle}>
            医師資格を持たない方(医学生・医療従事者・その他、デモ利用の学習者)向けの機能です。
            治療方針決定画面に <b>🩺 担当医に任せる</b> ボタンが表示されます。
          </p>
          <h3 style={h3Style}>動作</h3>
          <ul style={ulStyle}>
            <li style={liStyle}>投薬・機器・コンサルトを「担当医の推奨内容」で<b>自動入力</b></li>
            <li style={liStyle}>患者反応は全て承諾(「先生にお任せします」)</li>
            <li style={liStyle}>判断根拠(例:「心血管病既往あり → SGLT-2阻害薬+メトホルミン併用」)がチャットに表示</li>
            <li style={liStyle}>マスターボタン(一括)と、投薬・機器・コンサルト各セクションごとのサブボタンを併用可能</li>
          </ul>
          <h3 style={h3Style}>採点</h3>
          <p style={pStyle}>
            投薬・コンサルト・治療効果は<b>評価対象外</b>。問診・生活指導・患者対応の3軸で 100点満点で評価します。
            生活指導と患者教育のスキルを集中的に学べる設計です。
          </p>
        </div>

        {/* 6. 指導医コーチング */}
        <div id="sec6" style={sectionStyle}>
          <h2 style={h2Style}>6. 指導医コーチング機能</h2>
          <p style={pStyle}>
            問診中の入力欄上部で、3つのモードから選択できます:
          </p>
          <ul style={ulStyle}>
            <li style={liStyle}><b>細かく</b>:毎ターン丁寧な指導医コメントが表示(初学者・難症例向け)</li>
            <li style={liStyle}><b>推奨治療のみ</b>:患者がアドバイスを求めた時のみコメントが入る(中級者向け)</li>
            <li style={liStyle}><b>なし</b>:コーチングを切る(本番感重視、上級者向け)</li>
          </ul>
          <p style={pStyle}>
            学習段階に応じて段階的に切り替えるのが効果的です。途中でも変更可能です。
          </p>
        </div>

        {/* 7. デモ利用 */}
        <div id="sec7" style={sectionStyle}>
          <h2 style={h2Style}>7. デモ利用(身分選択)について</h2>
          <p style={pStyle}>
            ログイン画面の<b>「デモ」</b>ボタンから、会員登録なしで 3 症例まで体験できます(完遂数ベース)。
          </p>
          <h3 style={h3Style}>身分選択</h3>
          <p style={pStyle}>
            デモログイン後、症例選択画面の上部で身分を選択できます:
          </p>
          <ul style={ulStyle}>
            <li style={liStyle}><b>👨‍⚕️ 医師として</b>:患者から「先生」と呼ばれる通常モード</li>
            <li style={liStyle}><b>🎓 学習者として</b>:患者から「学習者さん」と呼ばれ、担当医に任せる機能が有効になる</li>
          </ul>
          <p style={pStyle}>
            選択はブラウザに保存され、いつでも切り替え可能です。完全利用には会員登録(無料)が必要です。
          </p>
        </div>

        {/* 8. カルテ機能 */}
        <div id="sec8" style={sectionStyle}>
          <h2 style={h2Style}>8. カルテ機能(📋 一時保存)</h2>
          <p style={pStyle}>
            画面右上の <b>📋 カルテ</b> ボタンで、現時点までの診療情報を一覧表示できます。
            複雑な症例で問診中・治療決定中に内容を整理するのに便利です。
          </p>
          <h3 style={h3Style}>カルテに含まれる項目</h3>
          <ul style={ulStyle}>
            <li style={liStyle}><b>患者基本情報</b>:主訴・現病歴・既往歴・家族歴・社会歴・服用中の薬</li>
            <li style={liStyle}><b>会話履歴</b>:医師-患者の対話を時系列で表示</li>
            <li style={liStyle}><b>検査結果</b>:実施したベースライン採血・身体診察・追加検査の結果</li>
            <li style={liStyle}><b>選択中の治療</b>:現時点で選択した投薬・生活指導・機器・コンサルト</li>
            <li style={liStyle}><b>患者反応ログ</b>:各治療項目に対する同意/拒否の履歴</li>
          </ul>
          <p style={pStyle}>
            カルテは Visit 1 → 2 → 3 を通じて累積されます。Visit 2 では Visit 1 のカルテ内容も参照できます。
          </p>
        </div>

        {/* 9. 採点ロジック */}
        <div id="sec9" style={sectionStyle}>
          <h2 style={h2Style}>9. 採点ロジック</h2>
          <h3 style={h3Style}>通常モード(医師資格あり)</h3>
          <p style={pStyle}>各 Visit と最終評価で、以下の4軸を 100点満点で評価:</p>
          <ul style={ulStyle}>
            <li style={liStyle}><b>問診・診察の質</b>:情報収集の網羅性・系統的な思考</li>
            <li style={liStyle}><b>治療選択の質</b>:ガイドライン適合(JSH2019、糖尿病治療ガイド2024、動脈硬化性疾患予防ガイドライン2022)・適応の妥当性・第一選択薬の選択</li>
            <li style={liStyle}><b>患者対応の質</b>:共感的傾聴・性格や生活背景への配慮・適切な介入数</li>
            <li style={liStyle}><b>アウトカム</b>:検査値改善(HbA1c・LDL・血圧 等)・治療目標の達成</li>
          </ul>
          <h3 style={h3Style}>学習モード(担当医に任せる使用時)</h3>
          <p style={pStyle}>3軸 100点満点で評価:</p>
          <ul style={ulStyle}>
            <li style={liStyle}>問診(33点)</li>
            <li style={liStyle}>生活指導・患者教育(34点)</li>
            <li style={liStyle}>患者対応(33点)</li>
          </ul>
          <p style={pStyle}>投薬選択・コンサルト判断・治療効果(アウトカム)は評価対象外です。</p>
          <h3 style={h3Style}>治療効果の計算ロジック</h3>
          <p style={pStyle}>Visit 2/3 の検査値変化は以下を統合して算出されます:</p>
          <ul style={ulStyle}>
            <li style={liStyle}><b>薬効</b>:選択した薬剤による標準的な効果</li>
            <li style={liStyle}><b>生活指導の効果</b>:同意を得た指導内容と元の生活習慣の悪さに依存</li>
            <li style={liStyle}><b>実効アドヒアランス</b>:患者の隠しパラメータ(high/medium/low)+ 説得成功率 − 過負荷ペナルティ</li>
          </ul>
          <div style={noteBoxStyle}>
            介入数が過剰(4種類以上)で抵抗的な性格の患者には、過負荷でアドヒアランスが低下するペナルティがかかります。
            「少ない介入で高い同意率」が高評価につながります。
          </div>
        </div>

        {/* 10. フィードバックの見方 */}
        <div id="sec10" style={sectionStyle}>
          <h2 style={h2Style}>10. フィードバックの見方</h2>
          <p style={pStyle}>各 Visit 終了時と Visit 3 終了後に、AI 評価による詳細なフィードバックが表示されます:</p>
          <ul style={ulStyle}>
            <li style={liStyle}><b>良かった点</b>(2〜3点):今後も継続したい強み</li>
            <li style={liStyle}><b>改善が必要な点</b>(2〜3点):具体的な改善案</li>
            <li style={liStyle}><b>次の Visit で注意すべきポイント</b>:すぐに実践できる行動指針</li>
          </ul>
          <p style={pStyle}>
            学習モードでは「医師」「先生」という呼称を使わず、生活指導・患者教育に特化した内容になります。
            最終評価(Visit 3 終了後)では、3 Visit を通じた累積評価が示されます。
          </p>
        </div>

        {/* 11. よくある質問 */}
        <div id="sec11" style={sectionStyle}>
          <h2 style={h2Style}>11. よくある質問・コツ</h2>

          <h3 style={h3Style}>Q. 患者が治療に同意してくれません</h3>
          <p style={pStyle}>
            「説得」ボタンから追加の説明が可能です。患者の不安に共感を示し、薬の効果・副作用・リスクを
            具体的に説明すると承諾率が上がります。抵抗的な患者には、介入数を減らして優先順位の高いものに絞るのも有効です。
          </p>

          <h3 style={h3Style}>Q. 問診を何度もしてしまいます</h3>
          <p style={pStyle}>
            問診回数の多さは「丁寧な情報収集」としてプラス評価されます。回数自体で減点されることはありません。
            ただし、重要項目の<b>聞き漏れ</b>はマイナス評価対象です。
          </p>

          <h3 style={h3Style}>Q. 進行中の症例を中断したい</h3>
          <p style={pStyle}>
            離脱しても自動保存されます。次回ログイン時にトップの<b>「中断中の症例」</b>から再開できます。
          </p>

          <h3 style={h3Style}>Q. 専門医コンサルトは何科に依頼すべき?</h3>
          <p style={pStyle}>
            各疾患の標準的な連携(例:DMの眼科・皮膚科、HTの眼科(重症時)、HLの循環器(二次予防))は加点対象です。
            必要性の低い「過剰連携」は軽度マイナス。プライマリケアで完結できる症例ではコンサルトなしでも減点されません。
          </p>

          <h3 style={h3Style}>Q. 既存薬は中止すべき?</h3>
          <p style={pStyle}>
            来院前から服用中の薬は、医学的に妥当な理由(副作用・腎機能低下・適応外 等)があるときのみ中止判断を。
            不適切な中止は安全性の問題としてマイナス評価です。
          </p>

          <h3 style={h3Style}>Q. デモ利用の制限を解除したい</h3>
          <p style={pStyle}>
            メールアドレスでの会員登録(無料)で 3 症例制限が解除され、ランダム生成症例も利用可能になります。
          </p>

          <h3 style={h3Style}>Q. 指導医として研修医に使わせたい</h3>
          <p style={pStyle}>
            指導医モードを有効にし、研修医の進捗を管理画面から確認できます。
            「指導医コーチング機能」のオン/オフで難易度を調整しながら段階的に学習を進めさせてください。
          </p>
        </div>

        {/* フッター */}
        <div style={{ textAlign: 'center', marginTop: '24px', marginBottom: '20px' }}>
          <button onClick={function() { router.push('/cases') }}
            style={{ padding: '10px 24px', fontSize: '13px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
            症例選択へ戻る
          </button>
        </div>

      </div>
    </div>
  )
}
