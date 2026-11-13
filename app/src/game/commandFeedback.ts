/**
 * G1.7-B：统一命令反馈分流。拒绝只走失败反馈并中止后续成功 UI；成功才执行成功反馈。
 * 返回 false 时调用方必须立即 return，保持当前事件卡 / 对话层与业务状态。
 */
export function routeCommandFeedback<T extends { rejected?: string }>(
  result: T,
  onRejected: (reason: string) => void,
  onAccepted: () => void,
): boolean {
  if (result.rejected) {
    onRejected(result.rejected)
    return false
  }
  onAccepted()
  return true
}
