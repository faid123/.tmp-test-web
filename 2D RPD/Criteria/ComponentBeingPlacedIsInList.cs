using System.Collections;
using System.Collections.Generic;
using UnityEngine;

[CreateAssetMenu(fileName = "ComponentBeingPlacedIsInList", menuName = "Criteria/Component Being Placed Is In List")]
public class ComponentBeingPlacedIsInList : Criteria
{
	public bool flipOutput = false;

	public RPD_2DComponent.componentType[] components;

	public override bool Assess(PlacementData placementData, out CriteriaFailureData failureData)
	{
		failureData = null;

		bool result = Check(placementData.selectedToothFDIIndex);

		if (!result)
			failureData = GenerateFailureData("Selected component is not present in list.", actionUponFailure);

		return result;
	}

	protected virtual bool Check(int toothIndex)
	{
		return DLLIntegration.instance.CheckToothPressence(toothIndex);
	}
}
