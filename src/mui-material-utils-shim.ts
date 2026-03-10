// Shim para @mui/material/utils → reexporta lo que usa @mui/icons-material
// (@mui/icons-material@7 necesita createSvgIcon de @mui/material/utils, pero
//  este proyecto usa @mui/joy que tiene su propia implementación compatible)
// @ts-ignore – @mui/joy no expone esta ruta en su exports map (Node16), pero Vite la resuelve
export { default as createSvgIcon } from '@mui/joy/utils/createSvgIcon';
