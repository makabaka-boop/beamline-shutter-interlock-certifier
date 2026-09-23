import type { Rule, WitnessStep } from '../domain/types'

function ruleText(rule: Rule): string {
  return `${rule.aId} ${rule.aState} ∨ ${rule.bId} ${rule.bState}`
}

/**
 * 一条蕴含路径的可复核展示：每一步都是“若前提文字成立，则结论文字必成立”，
 * 并完整复述产生该蕴含的原始二元规则（或标注为操作员锁定约束），可逐条核对。
 */
export function WitnessPath({
  title,
  steps,
  rules,
}: {
  title: string
  steps: WitnessStep[]
  rules: Rule[]
}) {
  return (
    <div className="witness-path" data-testid="witness-path">
      <h4>{title}</h4>
      {steps.length === 0 ? (
        <p className="muted">（零步，起始假设本身被锁定约束直接禁止）</p>
      ) : (
        <ol className="witness-steps">
          {steps.map((step, i) => (
            <li key={i} className="witness-step">
              <span className="witness-assertion">
                第 {i + 1} 步：若 <strong>{step.fromShutterId} = {step.fromState}</strong>
                ，则必有 <strong>{step.shutterId} = {step.toState}</strong>
              </span>
              <span className="witness-origin">
                {step.origin.kind === 'rule' ? (
                  <>
                    依据原始<strong>规则 #{step.origin.ruleIndex}</strong>
                    （{ruleText(rules[step.origin.ruleIndex - 1])}，两文字至少一个成立）：
                    前提文字是该规则某文字的反面，故另一文字必须成立。
                  </>
                ) : (
                  <>
                    依据操作员锁定约束：{step.shutterId} 被锁定，
                    不允许处于 {step.fromState}，故必须为 {step.toState}。
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
