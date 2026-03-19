// Shim para @mui/material/utils → reexporta lo que usa @mui/icons-material
// (@mui/icons-material@7 necesita createSvgIcon de @mui/material/utils, pero
//  este proyecto usa @mui/joy que tiene su propia implementación compatible)
// @ts-ignore – @mui/joy no expone esta ruta en su exports map (Node16), pero Vite la resuelve
import createSvgIconJoy from '@mui/joy/utils/createSvgIcon';
export const createSvgIcon = createSvgIconJoy;
export default createSvgIconJoy;
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const useIsomorphicLayoutEffect = (f: any) => f();
export const debounce = (f: any) => f;

