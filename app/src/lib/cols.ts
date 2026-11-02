export interface Col<T> {
  key: string
  label: string
  width: string // css grid track, e.g. '1fr' or '90px'
  sort?: (r: T) => string | number
  align?: 'right' | 'center'
}
