using System.Collections.Generic;
using UnityEngine;


[CreateAssetMenu(fileName = "NOT Criteria", menuName = "Criteria/Multi/NOT")]
public class NotCriteria : AndCriteria
{
	//!!IMPORTANT!!
	//THE -NOT- CRITERIA IS UNABLE TO DETERMINE THE REASON FOR FAILURE SINCE IT ONLY FLIPS THE -AND- OUTPUT
	//FAILURE MODE IS NOT TAKEN INTO CONSIDERATION FOR THIS AND WILL ALWAYS USE THE MODE THAT IS SET
	//!!IMPORTANT!!

	public override bool Assess(PlacementData placementData, out CriteriaFailureData failureData)
	{
		bool result = !base.Assess(placementData, out failureData);

		failureData = null;

		if (!result)
			failureData = GenerateFailureData("NOT Criteria failed.", actionUponFailure);

		return result;
	}
}
