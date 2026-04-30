function groupSubOptions(subOptions) {
  const categoryLabels = {
    calorie: 'カロリー制限の目標',
    salt: '塩分制限の目標',
    eating_out: '外食の制限',
    night_eating: '夜食・間食の制限',
    alcohol: '飲酒制限の目標',
    aerobic: '有酸素運動',
    resistance: '筋力トレーニング',
    flexibility: 'ストレッチ・柔軟',
    lifestyle: '日常活動',
    education: '服薬説明',
    strategy: '服薬戦略',
    tool: '服薬ツール',
    social: '社会的サポート',
    monitoring: 'モニタリング方法',
    mental: '心理的ケア',
    referral: '専門機関紹介',
    weight_goal: '体重目標',
    none: 'その他',
  }
  const categoryOrder = [
    'calorie', 'salt', 'eating_out', 'night_eating', 'alcohol',
    'aerobic', 'resistance', 'flexibility', 'lifestyle',
    'education', 'strategy', 'tool', 'social', 'monitoring',
    'mental', 'referral', 'weight_goal', 'none'
  ]
  const groups = {}
  if (!subOptions) return groups
  subOptions.forEach(function(sub) {
    const cat = sub.category || 'none'
    if (!groups[cat]) {
      groups[cat] = {
        label: categoryLabels[cat] || cat,
        items: [],
        order: categoryOrder.indexOf(cat) >= 0 ? categoryOrder.indexOf(cat) : 99
      }
    }
    groups[cat].items.push(sub)
  })
  const sorted = {}
  Object.keys(groups)
    .sort(function(a, b) { return groups[a].order - groups[b].order })
    .forEach(function(k) { sorted[k] = groups[k] })
  return sorted
}
