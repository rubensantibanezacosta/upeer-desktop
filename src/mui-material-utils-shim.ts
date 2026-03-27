import createSvgIconJoy from '@mui/joy/utils/createSvgIcon';
export const createSvgIcon = createSvgIconJoy;
export default createSvgIconJoy;
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const useIsomorphicLayoutEffect = (effect: () => void) => effect();
export const debounce = <Fn extends (...args: never[]) => unknown>(fn: Fn) => fn;

