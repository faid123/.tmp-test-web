using System.Collections;
using System.Collections.Generic;
using UnityEngine;

[CreateAssetMenu(menuName = "Criteria/No Assembly Conflicting Components", fileName = "No Assembly Conflicting Components Criteria")]
public class NoAssemblyConflictingComponents : NoConflictingComponents
{
	public override bool Assess(PlacementData placementData, out CriteriaFailureData failureData)
	{
		if (!PlacingAssembly(placementData))
		{
			//if not placing assembly, prevent performing this criteria check
			failureData = null;
			return true;
		}

		return base.Assess(placementData, out failureData);
	}

	bool PlacingAssembly(PlacementData placementData)
	{
		if (placementData == null)
			return false;

		if (placementData.structure == null)
			return false;

		return placementData.structure is RPDAssembly;
	}
}
