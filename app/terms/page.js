'use client'

import { useRouter } from 'next/navigation'

const sectionStyle = {
  fontSize: '15px', fontWeight: 'bold', color: '#0369a1',
  margin: '20px 0 8px', paddingBottom: '4px', borderBottom: '1px solid #e2e8f0'
}
const pStyle = { fontSize: '13px', lineHeight: 1.8, color: '#334155', margin: '6px 0' }
const liStyle = { fontSize: '13px', lineHeight: 1.8, color: '#334155', marginBottom: '4px' }
const olStyle = { paddingLeft: '24px', margin: '6px 0' }
const ulStyle = { paddingLeft: '24px', margin: '6px 0' }
const emStyle = { color: '#dc2626', fontWeight: 'bold' }

export default function TermsPage() {
  const router = useRouter()
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>📋 利用規約</h1>
          <button onClick={function() { router.back() }}
            style={{ padding: '8px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
            ← 戻る
          </button>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px 28px', border: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px', textAlign: 'right' }}>
            <b>Version 1.0</b> / 制定日: 2026年5月12日
          </p>

          <p style={pStyle}>
            本利用規約（以下「本規約」といいます）は、<b>医仁会武田総合病院 臨床研修部</b>（以下「当方」といいます）が提供する医療研修シミュレーションアプリケーション「<b>PC Training</b>」（以下「本サービス」といいます）の利用条件を定めるものです。本サービスを利用するすべての利用者（以下「ユーザー」といいます）は、本規約に同意したうえで本サービスを利用するものとします。
          </p>

          <h2 style={sectionStyle}>第1条（適用）</h2>
          <ol style={olStyle}>
            <li style={liStyle}>本規約は、ユーザーと当方との間の本サービスの利用に関わる一切の関係に適用されます。</li>
            <li style={liStyle}>当方は、本サービス上で運用方針、ガイドライン等を別途定めることがあり、これらは本規約の一部を構成します。</li>
          </ol>

          <h2 style={sectionStyle}>第2条（定義）</h2>
          <p style={pStyle}>本規約における用語の定義は以下のとおりです。</p>
          <ul style={ulStyle}>
            <li style={liStyle}><b>本サービス</b>: 当方が提供するプライマリケア外来診療シミュレーション「PC Training」およびこれに付随する一切の機能。</li>
            <li style={liStyle}><b>ユーザー</b>: 本規約に同意の上、当方所定の方法でアカウント登録した個人。</li>
            <li style={liStyle}><b>生成データ</b>: 本サービスが AI(Anthropic 社の Claude API 等)を用いて自動生成する患者プロフィール、診療応答、評価コメント等のコンテンツ。</li>
            <li style={liStyle}><b>ユーザーデータ</b>: ユーザーが本サービス利用時に入力・選択・保存する情報(プロフィール情報、診療記録、成績、グループ情報等)。</li>
          </ul>

          <h2 style={sectionStyle}>第3条（利用登録および利用者の範囲）</h2>
          <ol style={olStyle}>
            <li style={liStyle}>本サービスの利用を希望する者（以下「登録希望者」といいます）は、本規約に同意の上、当方の定める方法でユーザー登録の申請を行うものとします。</li>
            <li style={liStyle}>本サービスは、以下のいずれかに該当する者のみが利用できます。
              <ul style={ulStyle}>
                <li style={liStyle}><b>医療従事者</b>(医師、看護師、薬剤師、その他医療資格を有する者)</li>
                <li style={liStyle}><b>医学生・医療系学生</b>(医学部、看護学部、薬学部、その他医療系教育課程に在籍する者)</li>
                <li style={liStyle}><b>医療系教育関係者</b>(医学・医療系教育に携わる教員、研修指導者等)</li>
                <li style={liStyle}><b>当方が特別に承認した者</b>(本サービスの改善・研究に資する者として、当方の管理者が個別に承認した者)</li>
              </ul>
            </li>
            <li style={liStyle}>当方は、登録希望者が以下のいずれかに該当する場合、登録を拒否することがあります。
              <ul style={ulStyle}>
                <li style={liStyle}>前項に定める利用者の範囲に該当しない場合</li>
                <li style={liStyle}>本規約に違反するおそれがあると判断した場合</li>
                <li style={liStyle}>過去に本規約違反等により利用停止処分を受けたことがある場合</li>
                <li style={liStyle}>虚偽の情報を申請した場合</li>
                <li style={liStyle}>その他、当方が登録を不適当と判断した場合</li>
              </ul>
            </li>
          </ol>

          <h2 style={sectionStyle}>第4条（アカウントの管理）</h2>
          <ol style={olStyle}>
            <li style={liStyle}>ユーザーは、自己の責任においてアカウント情報(ログイン認証情報を含む)を管理するものとし、これを第三者に貸与・譲渡・売買・名義変更等してはなりません。</li>
            <li style={liStyle}>アカウントの管理不十分や第三者使用によって生じた損害について、当方は一切の責任を負いません。</li>
          </ol>

          <h2 style={sectionStyle}>第5条（利用料金）</h2>
          <ol style={olStyle}>
            <li style={liStyle}>本サービスは、<b>無償</b>で提供されます。当方は、本サービスについて商用提供を行う予定はありません。</li>
            <li style={liStyle}>ただし、当方は将来において、本サービスの一部または全部について有償化または利用形態の変更を行う可能性を完全に排除するものではありません。料金が発生する機能を導入する場合は、ユーザーの明示的な同意を得た上で利用に供します。</li>
          </ol>

          <h2 style={sectionStyle}>第6条（禁止事項）</h2>
          <p style={pStyle}>ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。</p>
          <ol style={olStyle}>
            <li style={liStyle}><span style={emStyle}>実在患者の個人情報の入力</span>(氏名・連絡先・カルテ番号その他、特定の個人を識別できる情報のすべて)</li>
            <li style={liStyle}>法令または公序良俗に違反する行為</li>
            <li style={liStyle}>犯罪行為に関連する行為</li>
            <li style={liStyle}>本サービスの内容、運営、他のユーザーまたは第三者の権利を侵害する行為</li>
            <li style={liStyle}>本サービスのサーバーまたはネットワークの機能を破壊・妨害する行為</li>
            <li style={liStyle}>本サービスのリバースエンジニアリング、逆コンパイル、改変、不正アクセス</li>
            <li style={liStyle}>本サービスを通じて取得した情報を、商業目的・営利目的で無断使用する行為</li>
            <li style={liStyle}>AI が生成した診療応答・評価コメントを、<span style={emStyle}>実臨床における医学的判断の根拠として使用する行為</span></li>
            <li style={liStyle}>他のユーザーになりすます行為</li>
            <li style={liStyle}>グループ機能において、他のユーザーへの誹謗中傷・差別・ハラスメントに該当する行為</li>
            <li style={liStyle}>当方、他のユーザー、または第三者の知的財産権、肖像権、プライバシー、名誉、信用その他の権利を侵害する行為</li>
            <li style={liStyle}>その他、当方が不適切と判断する行為</li>
          </ol>

          <h2 style={sectionStyle}>第7条（本サービスの提供の停止等）</h2>
          <ol style={olStyle}>
            <li style={liStyle}>当方は、以下のいずれかに該当する場合、ユーザーへの事前の通知なく本サービスの全部または一部の提供を停止または中断できるものとします。
              <ul style={ulStyle}>
                <li style={liStyle}>本サービスのシステム保守または更新を行う場合</li>
                <li style={liStyle}>地震、落雷、火災、停電または天災等の不可抗力により、本サービスの提供が困難となった場合</li>
                <li style={liStyle}>サーバー、ネットワーク等の障害が発生した場合</li>
                <li style={liStyle}>当方が利用するクラウドサービス(Supabase、Vercel、Anthropic 社の Claude API 等)に障害が発生した場合</li>
                <li style={liStyle}>その他、当方が本サービスの提供が困難と判断した場合</li>
              </ul>
            </li>
            <li style={liStyle}>当方は、本サービスの提供の停止または中断により、ユーザーまたは第三者に生じたいかなる不利益または損害について、一切の責任を負いません。</li>
          </ol>

          <h2 style={sectionStyle}>第8条（利用制限および登録抹消）</h2>
          <ol style={olStyle}>
            <li style={liStyle}>当方は、ユーザーが以下のいずれかに該当する場合、事前の通知なく、当該ユーザーに対し本サービスの全部または一部の利用を制限し、またはアカウントを抹消できるものとします。
              <ul style={ulStyle}>
                <li style={liStyle}>本規約のいずれかの条項に違反した場合</li>
                <li style={liStyle}>登録事項に虚偽の事実があることが判明した場合</li>
                <li style={liStyle}>当方からの連絡に対し、相当期間応答がない場合</li>
                <li style={liStyle}>本サービスについて、最終の利用から180日以上利用がない場合</li>
                <li style={liStyle}>その他、当方が本サービスの利用を適当でないと判断した場合</li>
              </ul>
            </li>
            <li style={liStyle}>当方は、本条に基づき当方が行った行為によりユーザーに生じた損害について、一切の責任を負いません。</li>
          </ol>

          <h2 style={sectionStyle}>第9条（退会）</h2>
          <ol style={olStyle}>
            <li style={liStyle}>ユーザーは、当方の定める手続きにより、いつでも本サービスから退会できます。</li>
            <li style={liStyle}>退会した場合、ユーザーのプロフィール情報および中断中の症例データは削除されます。なお、完遂された症例の成績情報は、教育研修上の意義に鑑み、匿名化された統計データとして当方が保持することができます。</li>
            <li style={liStyle}>退会処理には、システム上の都合により一定の期間を要することがあります。</li>
          </ol>

          <h2 style={sectionStyle}>第10条（保証の否認および免責事項）</h2>
          <ol style={olStyle}>
            <li style={liStyle}><span style={emStyle}>本サービスは「現状有姿(as-is)」で提供されるものであり、当方は、本サービスに事実上または法律上の瑕疵(安全性、信頼性、正確性、完全性、有効性、特定目的への適合性、セキュリティなどに関する欠陥、エラーやバグ、権利侵害などを含みます)がないことを明示的にも黙示的にも保証しません。</span></li>
            <li style={liStyle}>当方は、本サービスを利用した結果生じた、いかなる損害(直接的・間接的、特別、結果的または懲罰的損害、得べかりし利益の喪失を含むがこれに限られない)について、一切の責任を負いません。</li>
            <li style={liStyle}>本サービスは医療研修・教育を目的とした非営利の運営であり、サービス継続性、データ保持、応答性能等について、商用サービスと同等の保証を行うものではありません。</li>
          </ol>

          <h2 style={sectionStyle}>第11条（AI 利用に関する特記事項）</h2>
          <ol style={olStyle}>
            <li style={liStyle}>本サービスは、Anthropic 社の Claude API その他の大規模言語モデル(LLM)を利用して、患者応答・診療フィードバック・評価コメント等を自動生成しています。</li>
            <li style={liStyle}><span style={emStyle}>AI による生成内容は、医学的に不正確な情報を含む可能性があります。</span> 最新のガイドライン、各種学会の推奨、エビデンスと一致しない応答が生成されることがあります。</li>
            <li style={liStyle}>ユーザーは、本サービスにおける AI 生成コンテンツを、<span style={emStyle}>あくまで教育・訓練目的の参考情報として利用するものとし、実際の患者診療、診断、治療方針の決定、処方判断その他の医学的判断に直接利用してはなりません。</span></li>
            <li style={liStyle}>AI 生成コンテンツに起因して生じた、いかなる損害についても当方は責任を負いません。</li>
            <li style={liStyle}>ユーザーの入力内容は、AI への問い合わせのため Anthropic 社のサーバーに送信されます。Anthropic 社のプライバシーポリシー(<a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#0369a1' }}>https://www.anthropic.com/legal/privacy</a>)も併せてご確認ください。</li>
          </ol>

          <h2 style={sectionStyle}>第12条（実在患者情報の取扱禁止）</h2>
          <ol style={olStyle}>
            <li style={liStyle}>ユーザーは、本サービスの利用にあたり、<span style={emStyle}>実在する患者(特定可能な個人)の個人情報、診療情報、画像、その他一切の情報を入力・送信してはなりません。</span></li>
            <li style={liStyle}>本サービスにおける症例・患者プロフィールは、すべて教育目的の架空のものまたは AI 生成されたものとして取り扱われます。</li>
            <li style={liStyle}>万一、ユーザーが実在患者情報を入力した場合、当該情報の漏洩・拡散・第三者による閲覧等につき、当方は一切の責任を負いません。</li>
            <li style={liStyle}>ユーザーは、自身の所属医療機関・教育機関の規程および関連法令(個人情報保護法、医療情報の安全管理ガイドライン等)を遵守するものとします。</li>
          </ol>

          <h2 style={sectionStyle}>第13条（ユーザーデータの取り扱い）</h2>
          <ol style={olStyle}>
            <li style={liStyle}>ユーザーデータは、Supabase(米国 Supabase Inc.)のクラウドサービス上に保管されます。</li>
            <li style={liStyle}>当方は、ユーザーデータについて、サービス改善・障害対応・統計分析・教育研究等のために閲覧・利用することがあります。</li>
            <li style={liStyle}>当方は、法令に基づく場合または以下のいずれかに該当する場合を除き、ユーザーの同意なく第三者にユーザーデータを開示しません。
              <ul style={ulStyle}>
                <li style={liStyle}>人の生命、身体または財産の保護のために必要がある場合</li>
                <li style={liStyle}>公衆衛生の向上または児童の健全な育成の推進のために特に必要がある場合</li>
                <li style={liStyle}>国の機関、地方公共団体、これらの委託を受けた者が法令の定める事務を遂行することへの協力が必要な場合</li>
              </ul>
            </li>
          </ol>

          <h2 style={sectionStyle}>第14条（グループ機能における情報共有）</h2>
          <ol style={olStyle}>
            <li style={liStyle}>ユーザーがグループ機能を利用した場合、以下の情報が同一グループに所属する他のユーザーに開示されます。
              <ul style={ulStyle}>
                <li style={liStyle}>グループ内表示名(本名またはユーザーが設定したハンドル名)</li>
                <li style={liStyle}>挑戦症例数、合格症例数、達成疾患数、ランキング、最終ログイン日</li>
              </ul>
            </li>
            <li style={liStyle}>ユーザーは、グループへの参加に際し、上記情報の開示に同意するものとします。</li>
            <li style={liStyle}>ユーザーは、グループから脱退することにより、以後の情報共有を停止できます。</li>
          </ol>

          <h2 style={sectionStyle}>第15条（知的財産権）</h2>
          <ol style={olStyle}>
            <li style={liStyle}>本サービスに関する一切の知的財産権は、当方または当方にライセンスを許諾している権利者に帰属します。</li>
            <li style={liStyle}>ユーザーが本サービスに投稿・入力した情報(症例設定、診療内容等)について、当方は、本サービスの提供・改善・統計分析・教育研究その他の目的で、無償・無期限・地域制限なく利用できる権利を有するものとします。</li>
          </ol>

          <h2 style={sectionStyle}>第16条（本サービスの変更等）</h2>
          <p style={pStyle}>当方は、ユーザーへの事前の通知なく、本サービスの内容を変更、追加、または廃止することができるものとし、ユーザーはこれを承諾するものとします。</p>

          <h2 style={sectionStyle}>第17条（利用規約の変更）</h2>
          <ol style={olStyle}>
            <li style={liStyle}>当方は、必要と判断した場合には、ユーザーに通知することなくいつでも本規約を変更できるものとします。</li>
            <li style={liStyle}>変更後の本規約は、本サービス上で公開された時点から効力を生じるものとします。重要な変更については、本サービス上で通知します。</li>
            <li style={liStyle}>変更後にユーザーが本サービスを利用した場合、変更後の本規約に同意したものとみなします。</li>
          </ol>

          <h2 style={sectionStyle}>第18条（個人情報の取扱い）</h2>
          <ol style={olStyle}>
            <li style={liStyle}>当方は、ユーザーから取得した個人情報を適切に取り扱います。</li>
            <li style={liStyle}>本サービスの利用にあたり当方が取得する個人情報の項目は以下のとおりです。
              <ul style={ulStyle}>
                <li style={liStyle}>メールアドレス(認証用)</li>
                <li style={liStyle}>氏名・ハンドル名(プロフィール設定で本人が登録した場合)</li>
                <li style={liStyle}>所属、身分(プロフィール設定で本人が登録した場合)</li>
                <li style={liStyle}>本サービスの利用履歴、診療記録、成績情報</li>
                <li style={liStyle}>アクセスログ(IP アドレス、ユーザーエージェント等)</li>
              </ul>
            </li>
          </ol>

          <h2 style={sectionStyle}>第19条（通知または連絡）</h2>
          <p style={pStyle}>ユーザーと当方との間の通知または連絡は、当方の定める方法(本サービス上での通知、メール、その他)によって行うものとします。</p>

          <h2 style={sectionStyle}>第20条（権利義務の譲渡の禁止）</h2>
          <p style={pStyle}>ユーザーは、当方の書面による事前の承諾なく、利用契約上の地位または本規約に基づく権利もしくは義務を第三者に譲渡、または担保に供することはできません。</p>

          <h2 style={sectionStyle}>第21条（準拠法・裁判管轄）</h2>
          <ol style={olStyle}>
            <li style={liStyle}>本規約の解釈にあたっては、<b>日本法</b>を準拠法とします。</li>
            <li style={liStyle}>本サービスに関して紛争が生じた場合には、<b>京都地方裁判所</b>を専属的合意管轄裁判所とします。</li>
          </ol>

          <div style={{ marginTop: '24px', paddingTop: '14px', borderTop: '1px solid #e2e8f0', fontSize: '12px', color: '#64748b' }}>
            <b>附則</b>: 本規約は、2026年5月12日から施行します。
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button onClick={function() { router.push('/') }}
            style={{ padding: '10px 18px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
            トップへ戻る
          </button>
        </div>
      </div>
    </div>
  )
}
