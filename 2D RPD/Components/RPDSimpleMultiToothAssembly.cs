using System.Collections;
using System.Collections.Generic;
using UnityEngine;

[CreateAssetMenu(fileName = "RPD Simple Multi Tooth Assembly", menuName = "Component/New Simple Multi Tooth Assembly")]
public class RPDSimpleMultiToothAssembly : RPDAssembly
{
	[Tooltip("The direction in which the Components will be placed relative to the clicked tooth. " +
		"E.g. Direction = Mesial, clicked tooth = 37, first component group will be placed on tooth FDI ID 37, " +
		"next component group will be placed on tooth FDI ID 36, the group after will be on tooth FDI ID 35 (mesial direction selected).")]
	public RPDDirection direction;

	[Tooltip("Populate with the number of components per group. " +
		"A group can be thought of as a 'component placing pass', " +
		"the group size is the number of components that will be placed in that pass. " +
		"The number of entries will determine the number of passes. " +
		"E.g. First pass will place 2 components, second pass places 3 components -> " +
		"componentGroupSize[0] = 2, componentGroupSize[1] = 3.")]
	public int[] componentGroupSizes;

	public override bool Place(int toothFDIID, out CriteriaFailureData failureData, out int componentsPlacedCount)
	{
		failureData = null;
		componentsPlacedCount = 0;

		int componentIndex = 0;
		int componentsPlacedThisPass = 0;
		
		for (int passCount = 0; passCount < componentGroupSizes.Length; passCount++)
		{
			bool success = HandleAssemblyPlacing(ref componentIndex, passCount, toothFDIID, out failureData, out componentsPlacedThisPass);

			if (!success)
			{
				UndoPlacedComponents(componentsPlacedCount);
				return false;
			}

			componentsPlacedCount += componentsPlacedThisPass;
		}

		return true;
	}

	protected virtual bool HandleAssemblyPlacing(ref int componentIndex, int passCount, int toothFDIID, out CriteriaFailureData failureData, out int componentsPlacedCount)
	{
		//get tooth FDI ID being modified this pass
		toothFDIID = GetCurrentPassToothFDIID(passCount, toothFDIID, direction);

		//get number of components being placed this pass
		int componentGroupSize = componentGroupSizes[passCount];

		//populate components that need to be placed in this pass
		RPDComponent[] componentsToPlace = new RPDComponent[componentGroupSize];

		for (int i = 0; i < componentGroupSize; i++)
		{
			int currComponentIndex = componentIndex + i;
			componentsToPlace[i] = rpdComponents[currComponentIndex];
		}

		componentIndex += componentGroupSize;

		//place components
		bool success = PerformPlacing(toothFDIID, componentsToPlace, out failureData, out componentsPlacedCount);

		if (!success)
			return false;

		return true;
	}

	protected virtual int GetCurrentPassToothFDIID(int passCount, int clickedToothFDIID, RPDDirection direction)
	{
		int modifier = direction == RPDDirection.Mesial ? -1 : 1;

		for (int i = 0; i < passCount; i++)
		{
			clickedToothFDIID += modifier;
		}

		return clickedToothFDIID;
	}
}
