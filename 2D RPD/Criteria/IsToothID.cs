using System.Collections;
using System.Collections.Generic;
using UnityEngine;

[CreateAssetMenu(fileName = "Is Tooth ID", menuName = "Criteria/Is Tooth ID")]
public class IsToothID : Criteria
{
	public int toothID;

	public override bool Assess(PlacementData placementData, out CriteriaFailureData failureData)
	{
		failureData = null;

		bool result = placementData.selectedToothFDIIndex == toothID;

		if (!result)
			failureData = GenerateFailureData("Incorrect tooth ID.", actionUponFailure);

		return result;
	}
}
