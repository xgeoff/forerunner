export function signal(initialValue) {
  let value = initialValue
  const fn = () => value
  fn.set = (next) => {
    value = next
  }
  return fn
}
