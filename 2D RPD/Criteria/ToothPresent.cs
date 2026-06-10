using System.Collections;
using System.Collections.Generic;
using UnityEngine;

[CreateAssetMenu(fileName = "Tooth Present", menuName = "Criteria/Tooth Present")]
public class ToothPresent : Criteria
{
	public override bool Assess(PlacementData placementData, out CriteriaFailureData failureData)
	{
		failureData = null;

		bool result = CheckToothPresence(placementData.selectedToothFDIIndex);

		if (!result)
			failureData = GenerateFailureData("Tooth is not present.", actionUponFailure);

		return result;
	}

	protected virtual bool CheckToothPresence(int toothIndex)
	{
		return DLLIntegration.instance.CheckToothPressence(toothIndex);
	}
}
