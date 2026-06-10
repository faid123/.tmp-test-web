using System.Collections.Generic;
using System.Linq;
using UnityEngine;

[CreateAssetMenu(fileName = "Close To Multi Component", menuName = "Criteria/Close To Multi Component")]
public class CloseToMultiComponent : Criteria
{
	public RPD_2DComponent.componentType[] components;

	[Tooltip("Number of teeth away from the tooth being checked the component can be for this criteria to be fulfilled. " +
		"0 = the tooth being checked itself, 1 = adjacent teeth, 2 = one tooth in between, etc")]
	public int range;

	public override bool Assess(PlacementData placementData, out CriteriaFailureData failureData)
	{
		failureData = null;

		List<int> teethFDIIDs = Utils.GetNearbyTeethFDIIDs(placementData.selectedToothFDIIndex, range);
		List<GenericTooth> teeth = GetGenericTeeth(teethFDIIDs, placementData.jawType);
		bool result = TeethContainsComponent(teeth, components);

		if (!result)
			failureData = GenerateFailureData($"Nearby teeth do not have the specified component: {string.Join(", ", components.Select(c => c.ToString()))}", actionUponFailure);

		return result;
	}

	public List<GenericTooth> GetGenericTeeth(List<int> teethFDIIDs, Jaw_Type jawType)
	{
		List<GenericTooth> result = new List<GenericTooth>();

		foreach (int toothID in teethFDIIDs)
		{
			result.Add(DLLIntegration.instance.GetToothByIndex(toothID));
		}

		return result;
	}

	public bool TeethContainsComponent(List<GenericTooth> teeth, RPD_2DComponent.componentType[] components)
	{
		foreach (GenericTooth tooth in teeth)
		{
			if (tooth.HasComponent(components))
				return true;
			else
				continue;
		}

		return false;
	}
}
