const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function clearLocalProjectCache(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>) {
  const projectIds: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && projectIdPattern.test(key)) projectIds.push(key);
  }
  projectIds.forEach((id) => storage.removeItem(id));
}
