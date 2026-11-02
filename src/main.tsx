import { initElsewhereApp } from './elsewhereApp';
import {installMobileViewport} from './mobileViewport';

const disposeViewport=installMobileViewport();
if(import.meta.hot)import.meta.hot.dispose(disposeViewport);
initElsewhereApp();
