public class PlacementData
{
	/// <summary>
	/// Denotes upper or lower jaw
	/// </summary>
	public Jaw_Type jawType;

	/// <summary>
	/// The tooth ID of the tooth being selected
	/// </summary>
	public int selectedToothFDIIndex { get; set; }

	/// <summary>
	/// The component being manipulated
	/// </summary>
	public RPDComponent component;

	/// <summary>
	/// The final structure being placed. E.g. Assembly, etc
	/// </summary>
	public RPDPlaceable structure;

	public PlacementData(RPDComponent rpdComponent, int toothFDIID, RPDPlaceable structure)
	{
		if (toothFDIID >= 30)
			jawType = Jaw_Type.upper_jaw;
		else
			jawType = Jaw_Type.lower_jaw;

		selectedToothFDIIndex = toothFDIID;

		component = rpdComponent;

		this.structure = structure;
	}
}
