// Existing suites intentionally restore their synthetic fixtures. Keep other prompts real.
module.exports = async context => context.addInitScript(() => {
  const confirm = window.confirm.bind(window);
  window.confirm = message => String(message).startsWith('确认恢复备份？\n') || confirm(message);
});
