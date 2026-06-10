using System.Collections.Generic;
using UnityEngine;

[CreateAssetMenu(fileName = "OR Criteria", menuName = "Criteria/Multi/OR")]
public class OrCriteria : MultiCriteria
{
	public override bool Assess(PlacementData placementData, out CriteriaFailureData failureDataCombined)
	{
		failureDataCombined = null;

		for (int i = 0; i < criteriaList.Count; i++)
		{
			Criteria criteria = criteriaList[i];

			if (criteria.Assess(placementData, out CriteriaFailureData failureData))
			{
				//clear failure reasons if this criteria passes
				failureDataCombined = null;
				return true;
			}
			else
			{
				//if this criteria fails, add its failure reason to the list of failure reasons
				if (i == 0)
					failureDataCombined = failureData;
				else
					failureDataCombined.CombineWith(failureData);
			}
		}

		if (failureMode == FailureMode.UseOwnActionUponFailure)
			failureDataCombined.actionUponFailure = actionUponFailure;

		//if we are returning false, we have gone through all the Criteria and combined their failure data
		return false;
	}
}
