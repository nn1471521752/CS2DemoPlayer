function isSupportedDemoPath(filePath) {
  const normalizedPath = String(filePath || '').trim().toLowerCase();
  if (!normalizedPath) {
    return false;
  }

  return normalizedPath.endsWith('.dem');
}

module.exports = {
  isSupportedDemoPath,
};
