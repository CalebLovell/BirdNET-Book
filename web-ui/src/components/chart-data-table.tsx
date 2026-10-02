/**
 * A detections chart's numbers as a table only screen readers see.
 *
 * The chart itself is reachable by keyboard -- recharts' accessibility layer
 * steps the tooltip along the points with the arrow keys -- but a screen
 * reader can only hear that one value at a time, and only after finding the
 * keys. The table is the whole series at once, read in browse mode like any
 * other table on the page.
 */
export function ChartDataTable({
	caption,
	bucketHeading,
	rows,
}: {
	caption: string;
	/** What each row is, e.g. "Month" or "Hour". */
	bucketHeading: string;
	rows: { label: string; count: number }[];
}) {
	return (
		<table className="sr-only">
			<caption>{caption}</caption>
			<thead>
				<tr>
					<th scope="col">{bucketHeading}</th>
					<th scope="col">Detections</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((row) => (
					<tr key={row.label}>
						<th scope="row">{row.label}</th>
						<td>{row.count.toLocaleString()}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
