/**
 * iconsax-react-native ships one .d.ts for its barrel index only. We deep-import
 * individual icons so Metro bundles ~50 glyphs instead of all 995, which needs
 * an ambient declaration for the per-icon module paths.
 */
declare module "iconsax-react-native/dist/esm/*" {
  import type { FC } from "react"
  import type { IconProps } from "iconsax-react-native"

  const Icon: FC<IconProps>
  export default Icon
}
