/**
 * How full the recordings disk is, shown in the Storage card beside the
 * threshold it is measured against. Null when the disk could not be measured:
 * a settings page that will not load because it could not stat a disk is worse
 * than one that leaves the figure out.
 */
export type StationHealth = {
	diskUsedPercent: number | null;
};
