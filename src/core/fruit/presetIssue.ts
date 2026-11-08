export type PresetIssue='storage-blocked'|'storage-failed'|'storage-timeout'|'library-invalid'|'selection-missing'|'preset-disabled'|'version-missing'|'overrides-incompatible';
export const presetIssueText:Record<PresetIssue,string>={
 'storage-blocked':'预设库被其他页面的更新阻塞，请关闭其他 Elsewhere 页面后重新读取。',
 'storage-failed':'无法读取私有预设库，请在预设 App 重新读取并检查浏览器存储权限。',
 'storage-timeout':'预设读取超时，请在预设 App 重新读取；本次未发送模型请求。',
 'library-invalid':'预设库记录无法通过验证，请在预设 App 检查或选择有效的备份；原库未重置。',
 'selection-missing':'当前角色缺少有效的预设选择，请在预设 App 选择或确认沿用旧配置。',
 'preset-disabled':'当前角色所选小说预设尚未启用，请在预设 App 检查后明确启用。',
 'version-missing':'角色配置引用的原件版本缺失，请在预设 App 复核原件及更新前备份。',
 'overrides-incompatible':'角色覆盖与原件不兼容，请在预设 App 复核覆盖；不会自动删除配置或回退。',
};
export class PresetPreparationError extends Error {
 constructor(readonly issue:PresetIssue,message=presetIssueText[issue]){super(message);}
}
