using UnityEngine;
using System.Collections.Generic;

[CreateAssetMenu(fileName = "Position Posterior", menuName = "Criteria/Position Posterior")]
public class PositionPosterior : PositionAnterior
{
	//FDI numbering, minor index positions
	protected List<int> posteriorPositions = new List<int> { 4, 5, 6, 7, 8 };
	public override bool Assess(PlacementData placementData, out CriteriaFailureData failureData)
	{
		failureData = null;

		bool result = CheckIfInCorrectPosition(placementData.selectedToothFDIIndex, posteriorPositions);

		if (!result)
			failureData = GenerateFailureData("Selected tooth is not in posterior position.", actionUponFailure);

		return result;
	}
}
