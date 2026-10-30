// Owner enabled the outlet after reviewing recovered product artwork.
export const OUTLET_ENABLED=true;
export const isPaused=p=>!!p?.outlet&&!OUTLET_ENABLED;
export const isListed=p=>!!p&&p.visible!==false&&!isPaused(p)&&!unavailableByStock(p);
import {unavailableByStock} from './availability.mjs';
