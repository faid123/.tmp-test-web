using UnityEngine;
using System.Collections.Generic;

[CreateAssetMenu(fileName = "Position Anterior", menuName = "Criteria/Position Anterior")]
public class PositionAnterior : Criteria
{
	//FDI numbering, minor index positions
	protected List<int> positions = new List<int> {1, 2, 3};

	public override bool Assess(PlacementData placementData, out CriteriaFailureData failureData)
	{
		failureData = null;

		bool result = CheckIfInCorrectPosition(placementData.selectedToothFDIIndex, positions);

		if (!result)
			failureData = GenerateFailureData("Selected tooth is not in anterior position.", actionUponFailure);

		return result;
	}

	protected bool CheckIfInCorrectPosition(int toothIndex, List<int> positions)
	{
		int minorIndex = toothIndex % 10;

		return positions.Contains(minorIndex);
	}
}
